const contextsByBrowser = new WeakMap();

function getInstanceKey(pageConfig) {
  return JSON.stringify([
    pageConfig.baseUrl,
    pageConfig.accessToken,
    pageConfig.language,
    pageConfig.theme
  ]);
}

async function createAuthenticatedContext(
  browser,
  pageConfig,
  renderingTimeout,
  logger
) {
  const browserContext = await browser.createIncognitoBrowserContext();
  let page = null;
  let authenticationFailed = false;

  try {
    page = await browserContext.newPage();

    const hassTokens = {
      hassUrl: pageConfig.baseUrl,
      access_token: pageConfig.accessToken,
      token_type: "Bearer"
    };

    logger.log("Priming browser's local storage with authentication entry...");
    await page.evaluateOnNewDocument(
      (tokens, selectedLanguage, selectedTheme) => {
        localStorage.setItem("hassTokens", tokens);
        localStorage.setItem("selectedLanguage", selectedLanguage);
        if (selectedTheme) {
          localStorage.setItem("selectedTheme", selectedTheme);
        }
      },
      JSON.stringify(hassTokens),
      JSON.stringify(pageConfig.language),
      pageConfig.theme ? JSON.stringify(pageConfig.theme) : null
    );

    logger.log(`Visiting '${pageConfig.baseUrl}' to establish session...`);
    await page.goto(pageConfig.baseUrl, {
      timeout: renderingTimeout
    });
    
    return browserContext;
  } catch (err) {
    authenticationFailed = true;
    throw err;
  } finally {
    if (page) {
      await page.close().catch((err) => {
        logger.error(
          "Failed to close login page after Home Assistant authentication:",
          err
        );
      });
    }
    if (authenticationFailed) {
      await browserContext.close().catch(() => {});
    }
  }
}

async function getAuthenticatedContext(
  browser,
  pageConfig,
  renderingTimeout,
  logger = console
) {
  let browserContexts = contextsByBrowser.get(browser);
  if (!browserContexts) {
    browserContexts = new Map();
    contextsByBrowser.set(browser, browserContexts);
  }

  const instanceKey = getInstanceKey(pageConfig);
  let contextPromise = browserContexts.get(instanceKey);

  if (!contextPromise) {
    contextPromise = createAuthenticatedContext(
      browser,
      pageConfig,
      renderingTimeout,
      logger
    );
    browserContexts.set(instanceKey, contextPromise);
  }

  try {
    return await contextPromise;
  } catch (err) {
    if (browserContexts.get(instanceKey) === contextPromise) {
      browserContexts.delete(instanceKey);
    }
    throw err;
  }
}

module.exports = {
  getAuthenticatedContext
};
