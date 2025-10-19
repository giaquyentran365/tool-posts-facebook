const fs = require("fs");
const path = require("path");
const { chromium } = require("rebrowser-playwright");

module.exports = {
  async postToGroupsAutomation(params) {
    const {
      groupIds,
      postId,
      authStatePath,
      storageStateObj,
      delayMinMs,
      delayMaxMs,
      headless = false,
      proxy = null,
      userDataDir = null,
      postContent,
      postMedia,
    } = params;

    // If neither file nor object storageState provided, throw
    if (!storageStateObj) {
      throw new Error(`No storage state provided`);
    }

    const browserOpts = {
      headless,
      channel: "chrome",
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-notifications",
      ],
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      timezoneId: "Asia/Ho_Chi_Minh",
      storageState: authStatePath,
    };

    if (proxy) browserOpts.proxy = proxy;
    if (userDataDir) browserOpts.storageState = undefined;

    let context;
    let browser;

    try {
      if (userDataDir) {
        context = await chromium.launchPersistentContext(
          userDataDir,
          browserOpts
        );
      } else {
        browser = await chromium.launch({ headless: headless, channel: 'chrome', args: browserOpts.args });
        context = await browser.newContext({ storageState: storageStateObj });
      }

      const page = await context.newPage();
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
      });
      console.log("✅ Logged in. Starting group posting...");

      for (const groupId of groupIds) {
        const groupUrl = `https://www.facebook.com/groups/${groupId}`;
        console.log(`\n➡ Navigating to group: ${groupUrl}`);
        await page.goto(groupUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(6000);

        const composerButtonSelector = 'div[role="button"] span:has-text("Bạn viết gì đi...")';
        const hasComposerButton = await page.locator(composerButtonSelector).count();

        if (!hasComposerButton) {
          console.log(
            `⚠ Composer button not found in group ${groupId}. Skipping...`
          );
          continue;
        }

        await page.locator(composerButtonSelector).first().click({ delay: 100 });
        await page.waitForTimeout(2000);

        // Wait for textbox inside popup
        const textBoxSelector = 'div[role="dialog"] div[role="textbox"]';
        await page.waitForSelector(textBoxSelector, { timeout: 10000 });
        await page.locator(textBoxSelector).click();
        
        // Use actual post content from database
        const contentToPost = postContent || `Automated post ID ${postId} to group ${groupId}`;
        await page.keyboard.type(contentToPost, { delay: 30 });

        // Upload images if available
        if (postMedia && postMedia.length > 0) {
          console.log(`📸 Uploading ${postMedia.length} images...`);
          
          try {
            // Cách 3: Click nút ảnh trước, sau đó set file input
            console.log(`📸 Looking for photo button to click first...`);
            
            // Try to find and click photo button first
            const photoButtonSelectors = [
              'div[aria-label="Thêm vào bài viết của bạn"] div[role="button"]:first-child',
              'div[aria-label="Add to your post"] div[role="button"]:first-child',
              'div[role="button"]:has-text("Ảnh/video")',
              'div[role="button"]:has-text("Photo/Video")',
              'div[aria-label*="ảnh"]',
              'div[aria-label*="photo"]'
            ];
            
            let photoButtonClicked = false;
            for (const selector of photoButtonSelectors) {
              try {
                const hasButton = await page.locator(selector).count();
                if (hasButton > 0) {
                  console.log(`📸 Found photo button: ${selector}`);
                  await page.locator(selector).first().click();
                  await page.waitForTimeout(1000);
                  photoButtonClicked = true;
                  console.log(`📸 Photo button clicked successfully`);
                  break;
                }
              } catch (e) {
                console.log(`📸 Photo button click failed: ${e.message}`);
                // Continue to next selector
              }
            }
            
            if (photoButtonClicked) {
              console.log(`📸 Photo button clicked, waiting for file input...`);
              await page.waitForTimeout(2000);
            } else {
              console.log(`📸 No photo button found, looking for file inputs directly...`);
              await page.waitForTimeout(1000);
            }
            
            // Find all file input elements
            const fileInputs = await page.locator('input[type="file"]').all();
            console.log(`📸 Found ${fileInputs.length} file input elements`);
            
            if (fileInputs.length > 0) {
              // Upload each image
              for (const imagePath of postMedia) {
                if (fs.existsSync(imagePath)) {
                  console.log(`📸 Uploading: ${imagePath}`);
                  try {
                    // Convert to absolute path and normalize for Windows
                    const absolutePath = path.resolve(imagePath).replace(/\\/g, '/');
                    console.log(`📸 Absolute path: ${absolutePath}`);
                    
                    // Try multiple file input elements
                    let uploadSuccess = false;
                    for (let i = 0; i < fileInputs.length; i++) {
                      try {
                        console.log(`📸 Trying file input ${i + 1}/${fileInputs.length}`);
                        await fileInputs[i].setInputFiles(absolutePath);
                        console.log(`📸 File input ${i + 1} set successfully`);
                        uploadSuccess = true;
                        break;
                      } catch (e) {
                        console.log(`📸 File input ${i + 1} failed: ${e.message}`);
                      }
                    }
                    
                    if (uploadSuccess) {
                      console.log(`📸 File input set, waiting for upload...`);
                      
                      // Wait longer for upload to complete
                      await page.waitForTimeout(8000); // Wait 8 seconds for upload
                      
                      // Check if image appears in the post with multiple selectors
                      let imageVisible = false;
                      const imageSelectors = [
                        '[data-testid="media-attachment"]',
                        '[data-testid="photo-attachment"]',
                        '[data-testid="video-attachment"]',
                        'div[aria-label*="photo"]',
                        'div[aria-label*="image"]',
                        'div[aria-label*="ảnh"]',
                        'div[role="img"]',
                        'img[src*="scontent"]',
                        'img[src*="fbcdn"]'
                      ];
                      
                      for (const selector of imageSelectors) {
                        try {
                          const element = await page.locator(selector).first();
                          if (await element.isVisible()) {
                            console.log(`📸 Image preview visible with selector: ${selector}`);
                            imageVisible = true;
                            break;
                          }
                        } catch (e) {
                          // Continue to next selector
                        }
                      }
                      
                      if (!imageVisible) {
                        console.log(`⚠️ Image preview not visible yet, trying to wait more...`);
                        // Wait a bit more and try again
                        await page.waitForTimeout(3000);
                        
                        for (const selector of imageSelectors) {
                          try {
                            const element = await page.locator(selector).first();
                            if (await element.isVisible()) {
                              console.log(`📸 Image preview visible after extra wait: ${selector}`);
                              imageVisible = true;
                              break;
                            }
                          } catch (e) {
                            // Continue to next selector
                          }
                        }
                      }
                      
                      if (!imageVisible) {
                        console.log(`⚠️ Image preview still not visible after extended wait`);
                        console.log(`⚠️ This means the image was NOT successfully uploaded to the post`);
                      } else {
                        console.log(`✅ Image preview is visible - upload successful!`);
                      }
                      
                      // Take screenshot to verify what's actually on the page
                      try {
                        const screenshotPath = `screenshot-${Date.now()}.png`;
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                        console.log(`📸 Screenshot saved: ${screenshotPath}`);
                      } catch (e) {
                        console.log(`⚠️ Could not take screenshot: ${e.message}`);
                      }
                      
                      // Check if there are any actual img elements with src
                      try {
                        const imgElements = await page.locator('img').all();
                        console.log(`📸 Found ${imgElements.length} img elements on page`);
                        
                        for (let i = 0; i < Math.min(imgElements.length, 5); i++) {
                          try {
                            const src = await imgElements[i].getAttribute('src');
                            const alt = await imgElements[i].getAttribute('alt');
                            console.log(`📸 Img ${i + 1}: src="${src?.substring(0, 50)}..." alt="${alt}"`);
                          } catch (e) {
                            // Skip this img
                          }
                        }
                      } catch (e) {
                        console.log(`⚠️ Could not check img elements: ${e.message}`);
                      }
                      
                      console.log(`📸 Successfully uploaded: ${imagePath}`);
                    } else {
                      console.log(`⚠️ Failed to upload with any file input`);
                    }
                  } catch (error) {
                    console.log(`⚠️ Error uploading ${imagePath}: ${error.message}`);
                  }
                } else {
                  console.log(`⚠️ Image file not found: ${imagePath}`);
                }
              }
              
              console.log(`📸 Images upload process completed`);
            } else {
              console.log(`⚠️ No file input found, skipping image upload`);
            }
          } catch (error) {
            console.log(`⚠️ Error uploading images: ${error.message}`);
          }
        }

        // Find Post button (new layout)
        const postButtonSelector =
          'div[role="dialog"] div[aria-label="Đăng"], div[role="button"]:has-text("Post")';
        const hasPostButton = await page.locator(postButtonSelector).count();

        if (hasPostButton) {
          await page.locator(postButtonSelector).click();
          console.log(`✅ Posted to group ${groupId}`);
        } else {
          console.log(`⚠ Post button not found for group ${groupId}`);
        }

        // Random delay between posts
        const delay = this.randomDelay(delayMinMs, delayMaxMs);
        console.log(
          `⏳ Waiting ${Math.round(delay / 1000)}s before next group...`
        );
        await page.waitForTimeout(delay);
      }

      console.log("\n🎯 Finished posting to all groups.");
    } catch (err) {
      console.error("Automation failed:", err);
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }

    return { success: true };
  },

  async checkLoggedIn(page) {
    try {
      const cookies = await page.context().cookies();
      const cUser = cookies.find((c) => c.name === "c_user");
      if (!cUser) return false;
      const isHomeVisible = await page.locator('div[role="feed"]').count();
      return !!isHomeVisible;
    } catch {
      return false;
    }
  },

  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
};
