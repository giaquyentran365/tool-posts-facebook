const { query } = require('../config/database');
const { isValidGroupUrl, extractGroupId, paginate } = require('../utils/helpers');
const { logAction, logger } = require('../utils/logger');

class GroupService {

  /**
   * Get all groups for a user
   */
  async getGroups(userId, filters = {}) {
    try {
      const { status, page = 1, limit = 20 } = filters;
      const { limit: pageLimit, offset } = paginate(parseInt(page), parseInt(limit));

      let queryText = `
        SELECT id, group_id, group_url, group_name, status, notes, 
               created_at, updated_at
        FROM groups
        WHERE user_id = $1
      `;

      const params = [userId];

      // Filter by status
      if (status) {
        params.push(status);
        queryText += ` AND status = $${params.length}`;
      }

      queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(pageLimit, offset);

      const result = await query(queryText, params);

      // Get total count
      const countResult = await query(
        'SELECT COUNT(*) FROM groups WHERE user_id = $1' + (status ? ' AND status = $2' : ''),
        status ? [userId, status] : [userId]
      );

      const totalCount = parseInt(countResult.rows[0].count);

      return {
        success: true,
        data: {
          groups: result.rows,
          pagination: {
            page: parseInt(page),
            limit: pageLimit,
            totalCount,
            totalPages: Math.ceil(totalCount / pageLimit)
          }
        }
      };

    } catch (error) {
      logger.error('Failed to get groups:', error);
      throw error;
    }
  }

  /**
   * Get single group by ID
   */
  async getGroupById(userId, groupId) {
    try {
      const result = await query(
        `SELECT id, group_id, group_url, group_name, status, notes, 
                created_at, updated_at
         FROM groups
         WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
      );

      if (result.rows.length === 0) {
        const error = new Error('Group not found');
        error.statusCode = 404;
        throw error;
      }

      return {
        success: true,
        data: {
          group: result.rows[0],
        }
      };

    } catch (error) {
      logger.error('Failed to get group:', error);
      throw error;
    }
  }

  /**
   * Add new group
   */
  async addGroup(userId, groupData) {
    try {
      const { groupId, groupUrl, groupName, notes } = groupData;

      // Validate group URL
      if (!isValidGroupUrl(groupUrl)) {
        const error = new Error('Invalid Facebook group URL');
        error.statusCode = 400;
        throw error;
      }

      // Extract group ID from URL if not provided
      const finalGroupId = groupId || extractGroupId(groupUrl);

      if (!finalGroupId) {
        const error = new Error('Could not extract group ID from URL');
        error.statusCode = 400;
        throw error;
      }

      // Check if group already exists
      const existing = await query(
        'SELECT id FROM groups WHERE user_id = $1 AND group_id = $2',
        [userId, finalGroupId]
      );

      if (existing.rows.length > 0) {
        const error = new Error('Group already added');
        error.statusCode = 409;
        throw error;
      }

      // Insert group
      const result = await query(
        `INSERT INTO groups (user_id, group_id, group_url, group_name, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'UNKNOWN')
         RETURNING id, group_id, group_url, group_name, status, created_at`,
        [userId, finalGroupId, groupUrl, groupName, notes]
      );

      const group = result.rows[0];

      logger.success('Group added:', finalGroupId);

      await logAction({
        userId,
        groupId: group.id,
        action: 'ADD_GROUP',
        status: 'SUCCESS',
        message: `Group added: ${finalGroupId}`
      });

      return {
        success: true,
        message: 'Group added successfully',
        data: { group }
      };

    } catch (error) {
      logger.error('Failed to add group:', error);
      throw error;
    }
  }

  /**
   * Bulk add groups
   */
  async bulkAddGroups(userId, groups) {
    try {
      const results = {
        success: [],
        failed: []
      };

      for (const groupData of groups) {
        try {
          const result = await this.addGroup(userId, groupData);
          results.success.push(result.data.group);
        } catch (error) {
          results.failed.push({
            groupUrl: groupData.groupUrl,
            error: error.message
          });
        }
      }

      logger.info(`Bulk add completed: ${results.success.length} success, ${results.failed.length} failed`);

      return {
        success: true,
        message: 'Bulk add completed',
        data: results
      };

    } catch (error) {
      logger.error('Bulk add failed:', error);
      throw error;
    }
  }

  /**
   * Update group
   */
  async updateGroup(userId, groupId, updates) {
    try {
      const { groupName, notes, status } = updates;

      // Build update query dynamically
      const updateFields = [];
      const params = [userId, groupId];
      let paramIndex = 3;

      if (groupName !== undefined) {
        updateFields.push(`group_name = $${paramIndex++}`);
        params.push(groupName);
      }

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        params.push(notes);
      }

      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (updateFields.length === 0) {
        const error = new Error('No fields to update');
        error.statusCode = 400;
        throw error;
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      const result = await query(
        `UPDATE groups SET ${updateFields.join(', ')}
         WHERE user_id = $1 AND id = $2
         RETURNING id, group_id, group_url, group_name, status, notes, updated_at`,
        params
      );

      if (result.rows.length === 0) {
        const error = new Error('Group not found');
        error.statusCode = 404;
        throw error;
      }

      logger.success('Group updated:', groupId);

      await logAction({
        userId,
        groupId,
        action: 'UPDATE_GROUP',
        status: 'SUCCESS',
        message: `Group updated: ${groupId}`
      });

      return {
        success: true,
        message: 'Group updated successfully',
        data: { group: result.rows[0] }
      };

    } catch (error) {
      logger.error('Failed to update group:', error);
      throw error;
    }
  }

  /**
   * Delete group
   */
  async deleteGroup(userId, groupId) {
    try {
      const result = await query(
        'DELETE FROM groups WHERE user_id = $1 AND id = $2 RETURNING id',
        [userId, groupId]
      );

      if (result.rows.length === 0) {
        const error = new Error('Group not found');
        error.statusCode = 404;
        throw error;
      }

      logger.success('Group deleted:', groupId);

      await logAction({
        userId,
        groupId,
        action: 'DELETE_GROUP',
        status: 'SUCCESS',
        message: `Group deleted: ${groupId}`
      });

      return {
        success: true,
        message: 'Group deleted successfully'
      };

    } catch (error) {
      logger.error('Failed to delete group:', error);
      throw error;
    }
  }

  /**
   * Update group status
   */
  async updateGroupStatus(userId, groupId, status) {
    try {
      const result = await query(
        `UPDATE groups 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND id = $3
         RETURNING id, group_id, status`,
        [status, userId, groupId]
      );

      if (result.rows.length === 0) {
        const error = new Error('Group not found');
        error.statusCode = 404;
        throw error;
      }

      logger.success(`Group status updated to ${status}:`, groupId);

      await logAction({
        userId,
        groupId,
        action: 'UPDATE_GROUP_STATUS',
        status: 'SUCCESS',
        message: `Group status updated to ${status}`
      });

      return {
        success: true,
        message: 'Group status updated successfully',
        data: { group: result.rows[0] }
      };

    } catch (error) {
      logger.error('Failed to update group status:', error);
      throw error;
    }
  }

  /**
   * Get groups statistics
   */
  async getGroupsStats(userId) {
    try {
      const result = await query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'JOINED' THEN 1 END) as joined,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'BLOCKED' THEN 1 END) as blocked,
          COUNT(CASE WHEN status = 'NOT_JOINED' THEN 1 END) as not_joined,
          COUNT(CASE WHEN status = 'UNKNOWN' THEN 1 END) as unknown
         FROM groups
         WHERE user_id = $1`,
        [userId]
      );

      return {
        success: true,
        data: { stats: result.rows[0] }
      };

    } catch (error) {
      logger.error('Failed to get groups stats:', error);
      throw error;
    }
  }
}

module.exports = new GroupService();