import auditService from './auditService.js';
import logger from '../utils/logger.js';
import { AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_PRIORITY } from '../constants/audit.js';

const SPIKE_WINDOW_MS = 15 * 60 * 1000;
const SPIKE_THRESHOLD = 10;
const ipBuckets = new Map();

function pruneBucket(ip, now) {
  const bucket = ipBuckets.get(ip);
  if (bucket && now - bucket.windowStart > SPIKE_WINDOW_MS) {
    ipBuckets.delete(ip);
  }
}

class AuthSecurityService {
  async recordFailedLogin(email, ip) {
    const now = Date.now();
    pruneBucket(ip, now);

    let bucket = ipBuckets.get(ip);
    if (!bucket) {
      bucket = { count: 0, windowStart: now };
      ipBuckets.set(ip, bucket);
    }
    bucket.count += 1;

    await auditService.log({
      action: AUDIT_ACTIONS.FAILED_LOGIN,
      module: AUDIT_MODULES.AUTHENTICATION,
      recordType: 'Login Attempt',
      description: `Failed login for ${email}`,
      priority: AUDIT_PRIORITY.HIGH,
      details: { email, ip },
      ip,
    });

    if (bucket.count >= SPIKE_THRESHOLD) {
      logger.error('[SECURITY ALERT] Failed login spike detected', {
        ip,
        attemptsInWindow: bucket.count,
        windowMinutes: SPIKE_WINDOW_MS / 60_000,
        lastEmail: email,
      });
    }
  }
}

export default new AuthSecurityService();
