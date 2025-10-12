// src/lib/ipLogger.js

/**
 * Extract the real IP address from the request, considering proxies and load balancers
 */
function extractClientIP(req) {
  // Check various headers that might contain the real IP
  // Order matters - check most reliable sources first
  const ipHeaders = [
    'cf-connecting-ip',     // Cloudflare
    'x-forwarded-for',      // Standard proxy header
    'x-real-ip',           // Nginx
    'x-client-ip',         // Apache
    'x-forwarded',         // Alternative
    'x-cluster-client-ip', // Cluster
    'forwarded-for',       // Alternative
    'forwarded'            // RFC 7239
  ];

  // Try each header
  for (const header of ipHeaders) {
    const value = req.headers[header];
    if (value) {
      // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2)
      // The first IP is usually the original client
      const ips = value.split(',').map(ip => ip.trim());
      const clientIP = ips[0];
      
      // Basic validation - should be a valid IP format
      if (clientIP && isValidIP(clientIP)) {
        return clientIP;
      }
    }
  }

  // Fallback to connection remote address
  return req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         req.ip || 
         'unknown';
}

/**
 * Basic IP validation
 */
function isValidIP(ip) {
  // IPv4 regex
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  // IPv6 regex (simplified)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  // Check for common non-IP values
  const invalidValues = ['unknown', 'undefined', 'null', '', '::1', '127.0.0.1', '::ffff:127.0.0.1'];
  
  return !invalidValues.includes(ip) && (ipv4Regex.test(ip) || ipv6Regex.test(ip));
}

/**
 * Format IP address for logging (anonymize if needed)
 */
function formatIPForLogging(ip) {
  // You can add IP anonymization here if needed
  // For example, remove last octet: 192.168.1.123 -> 192.168.1.xxx
  return ip;
}

/**
 * Log IP address with context
 */
function logIP(req, action, details = {}) {
  const ip = extractClientIP(req);
  const formattedIP = formatIPForLogging(ip);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    action,
    ip: formattedIP,
    userAgent: userAgent.substring(0, 100), // Truncate long user agents
    ...details
  };
  
  console.log(`[IP-LOG] ${JSON.stringify(logEntry)}`);
}

module.exports = {
  extractClientIP,
  logIP,
  formatIPForLogging
};
