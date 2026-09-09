const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

dns.setDefaultResultOrder('ipv4first');

const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'object' && options !== null ? { ...options } : { hints: options };
  if (!opts.family) {
    opts.family = 4;
  }
  return originalLookup(hostname, opts, callback);
};
