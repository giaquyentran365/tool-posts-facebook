const { query } = require("../config/database");
const { paginate, calculateSuccessRate } = require("../utils/helpers");
const { logger } = require("../utils/logger");

class ReportService {
  /**
   * Get logs with filtering
   */
  async getLogs(userId, filters = {}) {
    try {
      const {
        action,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = filters;
      const { limit: pageLimit, offset } = paginate(
        parseInt(page),
        parseInt(limit)
      );

      let queryText = `
        SELECT l.id, l.post_id, l.group_id, l.action, l.status, 
               l.message, l.execution_time, l.created_at,
               p.title as post_title,
               g.group_name
        FROM logs l
        LEFT JOIN posts p ON l.post_id = p.id
        LEFT JOIN groups g ON l.group_id = g.id
        WHERE l.user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      // Filter by action
      if (action) {
        queryText += ` AND l.action = $${paramIndex++}`;
        params.push(action);
      }

      // Filter by status
      if (status) {
        queryText += ` AND l.status = $${paramIndex++}`;
        params.push(status);
      }

      // Filter by date range
      if (startDate) {
        queryText += ` AND l.created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        queryText += ` AND l.created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      queryText += ` ORDER BY l.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(pageLimit, offset);

      const result = await query(queryText, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM logs WHERE user_id = $1";
      const countParams = [userId];
      let countParamIndex = 2;

      if (action) {
        countQuery += ` AND action = $${countParamIndex++}`;
        countParams.push(action);
      }
      if (status) {
        countQuery += ` AND status = $${countParamIndex++}`;
        countParams.push(status);
      }
      if (startDate) {
        countQuery += ` AND created_at >= $${countParamIndex++}`;
        countParams.push(startDate);
      }
      if (endDate) {
        countQuery += ` AND created_at <= $${countParamIndex++}`;
        countParams.push(endDate);
      }

      const countResult = await query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      return {
        success: true,
        data: {
          logs: result.rows,
          pagination: {
            page: parseInt(page),
            limit: pageLimit,
            totalCount,
            totalPages: Math.ceil(totalCount / pageLimit),
          },
        },
      };
    } catch (error) {
      logger.error("Failed to get logs:", error);
      throw error;
    }
  }

  /**
   * Get overall statistics
   */
  async getStatistics(userId, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      let queryText = `
        SELECT 
          COUNT(*) as total_actions,
          COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as success_count,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count,
          COUNT(CASE WHEN action = 'POST_TO_GROUP' THEN 1 END) as total_posts,
          COUNT(CASE WHEN action = 'POST_TO_GROUP' AND status = 'SUCCESS' THEN 1 END) as successful_posts,
          COUNT(CASE WHEN action = 'POST_TO_GROUP' AND status = 'FAILED' THEN 1 END) as failed_posts,
          AVG(CASE WHEN execution_time IS NOT NULL THEN execution_time END) as avg_execution_time,
          MIN(created_at) as first_log,
          MAX(created_at) as last_log
        FROM logs
        WHERE user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (startDate) {
        queryText += ` AND created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        queryText += ` AND created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      const result = await query(queryText, params);
      const stats = result.rows[0];

      // Calculate success rate
      const successRate = calculateSuccessRate(
        parseInt(stats.successful_posts),
        parseInt(stats.total_posts)
      );

      // Get group count
      const groupResult = await query(
        "SELECT COUNT(*) as total_groups FROM groups WHERE user_id = $1",
        [userId]
      );

      // Get post count
      const postResult = await query(
        "SELECT COUNT(*) as total_posts FROM posts WHERE user_id = $1",
        [userId]
      );

      return {
        success: true,
        data: {
          statistics: {
            totalActions: parseInt(stats.total_actions),
            successCount: parseInt(stats.success_count),
            failedCount: parseInt(stats.failed_count),
            totalPosts: parseInt(stats.total_posts),
            successfulPosts: parseInt(stats.successful_posts),
            failedPosts: parseInt(stats.failed_posts),
            successRate: parseFloat(successRate),
            avgExecutionTime: stats.avg_execution_time
              ? Math.round(parseFloat(stats.avg_execution_time))
              : null,
            firstLog: stats.first_log,
            lastLog: stats.last_log,
            totalGroups: parseInt(groupResult.rows[0].total_groups),
            totalStoredPosts: parseInt(postResult.rows[0].total_posts),
          },
        },
      };
    } catch (error) {
      logger.error("Failed to get statistics:", error);
      throw error;
    }
  }

  /**
   * Get success rate by group
   */
  async getSuccessRateByGroup(userId, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      let queryText = `
        SELECT 
          g.id,
          g.group_name,
          g.group_url,
          COUNT(l.id) as total_attempts,
          COUNT(CASE WHEN l.status = 'SUCCESS' THEN 1 END) as successful_posts,
          COUNT(CASE WHEN l.status = 'FAILED' THEN 1 END) as failed_posts,
          AVG(CASE WHEN l.execution_time IS NOT NULL THEN l.execution_time END) as avg_execution_time,
          MAX(l.created_at) as last_post_at
        FROM groups g
        LEFT JOIN logs l ON g.id = l.group_id AND l.action = 'POST_TO_GROUP'
        WHERE g.user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (startDate) {
        queryText += ` AND (l.created_at IS NULL OR l.created_at >= $${paramIndex++})`;
        params.push(startDate);
      }

      if (endDate) {
        queryText += ` AND (l.created_at IS NULL OR l.created_at <= $${paramIndex++})`;
        params.push(endDate);
      }

      queryText += `
        GROUP BY g.id, g.group_name, g.group_url
        ORDER BY successful_posts DESC, total_attempts DESC
      `;

      const result = await query(queryText, params);

      // Calculate success rate for each group
      const groupStats = result.rows.map((row) => ({
        groupId: row.id,
        groupName: row.group_name,
        groupUrl: row.group_url,
        totalAttempts: parseInt(row.total_attempts),
        successfulPosts: parseInt(row.successful_posts),
        failedPosts: parseInt(row.failed_posts),
        successRate: calculateSuccessRate(
          parseInt(row.successful_posts),
          parseInt(row.total_attempts)
        ),
        avgExecutionTime: row.avg_execution_time
          ? Math.round(parseFloat(row.avg_execution_time))
          : null,
        lastPostAt: row.last_post_at,
      }));

      return {
        success: true,
        data: {
          groups: groupStats,
          totalGroups: groupStats.length,
        },
      };
    } catch (error) {
      logger.error("Failed to get success rate by group:", error);
      throw error;
    }
  }

  /**
   * Get posting activity timeline
   */
  async getPostingActivity(userId, days = 7) {
    try {
      const result = await query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as total_actions,
          COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed
         FROM logs
         WHERE user_id = $1 
           AND action = 'POST_TO_GROUP'
           AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [userId]
      );

      return {
        success: true,
        data: {
          activity: result.rows,
          days: days,
        },
      };
    } catch (error) {
      logger.error("Failed to get posting activity:", error);
      throw error;
    }
  }

  /**
   * Export logs to CSV
   */
  async exportLogs(userId, filters = {}) {
    try {
      const { startDate, endDate } = filters;

      let queryText = `
        SELECT 
          l.created_at,
          l.action,
          l.status,
          p.title as post_title,
          g.group_name,
          l.message,
          l.execution_time
        FROM logs l
        LEFT JOIN posts p ON l.post_id = p.id
        LEFT JOIN groups g ON l.group_id = g.id
        WHERE l.user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (startDate) {
        queryText += ` AND l.created_at >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        queryText += ` AND l.created_at <= $${paramIndex++}`;
        params.push(endDate);
      }

      queryText += " ORDER BY l.created_at DESC";

      const result = await query(queryText, params);

      // Generate CSV
      const headers = [
        "Timestamp",
        "Action",
        "Status",
        "Post Title",
        "Group Name",
        "Message",
        "Execution Time (ms)",
      ];
      const rows = result.rows.map((row) => [
        row.created_at,
        row.action,
        row.status,
        row.post_title || "",
        row.group_name || "",
        row.message || "",
        row.execution_time || "",
      ]);

      const csv = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

      logger.success(`Exported ${rows.length} logs to CSV`);

      return csv;
    } catch (error) {
      logger.error("Failed to export logs:", error);
      throw error;
    }
  }

  /**
   * Cleanup old logs
   */
  async cleanupOldLogs(userId, days = 30) {
    try {
      const result = await query(
        `DELETE FROM logs 
         WHERE user_id = $1 
           AND created_at < CURRENT_DATE - INTERVAL '${days} days'
         RETURNING id`,
        [userId]
      );

      const deletedCount = result.rows.length;

      logger.success(`Cleaned up ${deletedCount} old logs`);

      return {
        success: true,
        message: `Deleted ${deletedCount} logs older than ${days} days`,
        data: { deletedCount },
      };
    } catch (error) {
      logger.error("Failed to cleanup old logs:", error);
      throw error;
    }
  }
}

module.exports = new ReportService();
