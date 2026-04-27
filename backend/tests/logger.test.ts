import winston from 'winston';
import { piiRedactionFormat } from '../src/config/logger';

// Create a test logger with our PII redaction format
const createTestLogger = () => {
  const logs: any[] = [];
  
  const testLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      piiRedactionFormat(),
      winston.format.json(),
      winston.format.printf((info) => {
        logs.push(info);
        return JSON.stringify(info);
      })
    ),
    transports: [
      new winston.transports.Console({ silent: true })
    ]
  });
  
  return { logger: testLogger, logs };
};

describe('Logger PII Redaction', () => {
  describe('Email redaction', () => {
    it('should redact email addresses in messages', () => {
      const { logger, logs } = createTestLogger();
      logger.info('User john.doe@example.com logged in');
      
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('User [REDACTED] logged in');
    });

    it('should redact email addresses in object properties', () => {
      const { logger, logs } = createTestLogger();
      logger.info('User data', { email: 'user@test.com', name: 'John' });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].email).toBe('[REDACTED]');
      expect(logs[0].name).toBe('John');
    });

    it('should redact multiple email addresses', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Emails: admin@test.com and user@example.org');
      
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Emails: [REDACTED] and [REDACTED]');
    });
  });

  describe('Token redaction', () => {
    it('should redact JWT tokens in messages', () => {
      const { logger, logs } = createTestLogger();
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ';
      logger.info(`Authentication token: ${token}`);
      
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toContain('[REDACTED]');
      expect(logs[0].message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact authorization headers', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Request headers', { 
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'content-type': 'application/json'
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].authorization).toBe('[REDACTED]');
      expect(logs[0]['content-type']).toBe('application/json');
    });

    it('should redact API keys', () => {
      const { logger, logs } = createTestLogger();
      logger.info('API request', { 
        apiKey: 'sk_test_1234567890abcdef1234567890abcdef',
        endpoint: '/api/users'
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].apiKey).toBe('[REDACTED]');
      expect(logs[0].endpoint).toBe('/api/users');
    });
  });

  describe('Password redaction', () => {
    it('should redact password fields in objects', () => {
      const { logger, logs } = createTestLogger();
      logger.info('User registration', { 
        username: 'john_doe',
        password: 'secretPassword123',
        email: 'john@example.com'
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].username).toBe('john_doe');
      expect(logs[0].password).toBe('[REDACTED]');
      expect(logs[0].email).toBe('[REDACTED]');
    });

    it('should redact password in JSON strings', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Request body: {"username":"john","password":"secret123","email":"john@test.com"}');
      
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toContain('"password":"[REDACTED]"');
      expect(logs[0].message).toContain('[REDACTED]'); // email should be redacted too
    });
  });

  describe('Nested object redaction', () => {
    it('should redact sensitive data in nested objects', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Complex data', {
        user: {
          profile: {
            email: 'nested@example.com',
            name: 'John Doe'
          },
          auth: {
            token: 'abc123def456ghi789jkl012mno345pqr',
            refreshToken: 'xyz789uvw456rst123opq890lmn567hij'
          }
        },
        metadata: {
          source: 'api'
        }
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].user.profile.email).toBe('[REDACTED]');
      expect(logs[0].user.profile.name).toBe('John Doe');
      expect(logs[0].user.auth.token).toBe('[REDACTED]');
      expect(logs[0].user.auth.refreshToken).toBe('[REDACTED]');
      expect(logs[0].metadata.source).toBe('api');
    });

    it('should redact sensitive data in arrays', () => {
      const { logger, logs } = createTestLogger();
      logger.info('User list', {
        users: [
          { email: 'user1@test.com', name: 'User 1' },
          { email: 'user2@test.com', name: 'User 2' }
        ]
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].users[0].email).toBe('[REDACTED]');
      expect(logs[0].users[0].name).toBe('User 1');
      expect(logs[0].users[1].email).toBe('[REDACTED]');
      expect(logs[0].users[1].name).toBe('User 2');
    });
  });

  describe('Credit card redaction', () => {
    it('should redact credit card numbers', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Payment info: 4532-1234-5678-9012');
      
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Payment info: [REDACTED]');
    });

    it('should redact credit card fields in objects', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Payment data', {
        creditCardNumber: '4532123456789012',
        cardHolder: 'John Doe'
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].creditCardNumber).toBe('[REDACTED]');
      expect(logs[0].cardHolder).toBe('John Doe');
    });
  });

  describe('Edge cases', () => {
    it('should handle null and undefined values', () => {
      const { logger, logs } = createTestLogger();
      logger.info('Null test', { 
        nullValue: null, 
        undefinedValue: undefined,
        email: 'test@example.com'
      });
      
      expect(logs).toHaveLength(1);
      expect(logs[0].nullValue).toBeNull();
      expect(logs[0].undefinedValue).toBeUndefined();
      expect(logs[0].email).toBe('[REDACTED]');
    });

    it('should handle circular references gracefully', () => {
      const { logger, logs } = createTestLogger();
      const obj: any = { name: 'test' };
      obj.self = obj;
      
      expect(() => {
        logger.info('Circular test', obj);
      }).not.toThrow();
      
      expect(logs).toHaveLength(1);
    });

    it('should handle very deep nesting', () => {
      const { logger, logs } = createTestLogger();
      let deepObj: any = { email: 'deep@test.com' };
      for (let i = 0; i < 15; i++) {
        deepObj = { level: i, nested: deepObj };
      }
      
      expect(() => {
        logger.info('Deep nesting test', deepObj);
      }).not.toThrow();
      
      expect(logs).toHaveLength(1);
    });
  });
});