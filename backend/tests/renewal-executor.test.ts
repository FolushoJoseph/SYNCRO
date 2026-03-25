import { renewalExecutor } from '../src/services/renewal-executor';

// Mock supabase
jest.mock('../src/config/database', () => ({
  supabase: { from: jest.fn() },
}));

// Mock logger
jest.mock('../src/config/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  __esModule: true,
}));

// Mock blockchain service
jest.mock('../src/services/blockchain-service', () => ({
  blockchainService: {
    syncSubscription: jest.fn().mockResolvedValue({
      success: true,
      transactionHash: 'tx-hash-abc123',
    }),
  },
}));

// Mock DatabaseTransaction — passes the real supabase client through
jest.mock('../src/utils/transaction', () => ({
  DatabaseTransaction: {
    execute: jest.fn().mockImplementation((fn: (client: any) => any) => {
      const { supabase } = require('../src/config/database');
      return fn(supabase);
    }),
  },
}));

import { supabase } from '../src/config/database';
import { blockchainService } from '../src/services/blockchain-service';

describe('RenewalExecutor', () => {
  const mockRequest = {
    subscriptionId: 'sub-123',
    userId: 'user-456',
    approvalId: 'approval-789',
    amount: 9.99,
  };

  const validApproval = {
    subscription_id: 'sub-123',
    approval_id: 'approval-789',
    max_spend: 15.0,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    used: false,
  };

  const validSubscription = {
    id: 'sub-123',
    status: 'active',
    next_billing_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  };

  function makeChain(resolvedValue: any) {
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(resolvedValue),
    };
    return chain;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (blockchainService.syncSubscription as jest.Mock).mockResolvedValue({
      success: true,
      transactionHash: 'tx-hash-abc123',
    });
  });

  it('should execute renewal successfully', async () => {
    let callCount = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'renewal_approvals') {
        callCount++;
        if (callCount === 1) {
          // checkApproval select
          return makeChain({ data: validApproval, error: null });
        }
        // logSuccess insert
        return makeChain({ data: null, error: null });
      }
      if (table === 'subscriptions') {
        // validateBillingWindow + updateSubscription
        return makeChain({ data: validSubscription, error: null });
      }
      if (table === 'renewal_logs') {
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const result = await renewalExecutor.executeRenewal(mockRequest);

    expect(result.success).toBe(true);
    expect(result.subscriptionId).toBe(mockRequest.subscriptionId);
    expect(result.transactionHash).toBeDefined();
  });

  it('should fail with invalid approval', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'renewal_approvals') {
        return makeChain({ data: null, error: { message: 'Not found' } });
      }
      if (table === 'renewal_logs') {
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const result = await renewalExecutor.executeRenewal({ ...mockRequest, approvalId: 'invalid' });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('invalid_approval');
  });

  it('should fail when billing window invalid', async () => {
    const farFutureSubscription = {
      ...validSubscription,
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'renewal_approvals') {
        return makeChain({ data: validApproval, error: null });
      }
      if (table === 'subscriptions') {
        return makeChain({ data: farFutureSubscription, error: null });
      }
      if (table === 'renewal_logs') {
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const result = await renewalExecutor.executeRenewal(mockRequest);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('billing_window_invalid');
  });

  it('should retry on retryable failures', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'renewal_approvals') {
        return makeChain({ data: null, error: { message: 'Not found' } });
      }
      if (table === 'renewal_logs') {
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const result = await renewalExecutor.executeRenewalWithRetry(mockRequest, 3);

    expect(result).toBeDefined();
  });
});
