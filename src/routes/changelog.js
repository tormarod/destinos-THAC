// src/routes/changelog.js
// API endpoint for serving changelog content

const express = require("express");
const fs = require("fs");
const path = require("path");

module.exports = function () {
  const router = express.Router();

  /**
   * GET /api/changelog
   * Returns the changelog markdown content
   * Optional query parameter: ?version=X.X.X to get specific version
   */
  router.get("/changelog", (req, res) => {
    try {
      const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
      
      // Check if changelog file exists
      if (!fs.existsSync(changelogPath)) {
        return res.status(404).json({ 
          error: "Changelog not found",
          message: "CHANGELOG.md file does not exist"
        });
      }

      // Read changelog file
      const markdown = fs.readFileSync(changelogPath, "utf8");
      
      // If version parameter is provided, filter to that version
      const requestedVersion = req.query.version;
      if (requestedVersion) {
        const filteredContent = filterChangelogByVersion(markdown, requestedVersion);
        if (!filteredContent) {
          return res.status(404).json({ 
            error: "Version not found",
            message: `Version ${requestedVersion} not found in changelog`
          });
        }
        return res.send(filteredContent);
      }

      // Return full changelog
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(markdown);

    } catch (error) {
      console.error("Error reading changelog:", error);
      res.status(500).json({ 
        error: "Failed to read changelog",
        message: error.message 
      });
    }
  });

  /**
   * Filter changelog content to specific version
   */
  function filterChangelogByVersion(markdown, version) {
    const lines = markdown.split('\n');
    const versionHeader = `## [${version}]`;
    let startIndex = -1;
    let endIndex = lines.length;

    // Find the start of the requested version
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(versionHeader)) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return null; // Version not found
    }

    // Find the end of this version (next version header or end of file)
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## [')) {
        endIndex = i;
        break;
      }
    }

    // Extract the version content
    const versionLines = lines.slice(startIndex, endIndex);
    return versionLines.join('\n');
  }

  return router;
};
