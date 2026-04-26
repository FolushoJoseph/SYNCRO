import { UserPreferences, NotificationPriority, NotificationPayload } from '../types/reminder';
import logger from '../config/logger';

export interface QuietHoursCheck {
  isQuietHours: boolean;
  shouldDelay: boolean;
  delayUntil?: Date;
  reason?: string;
}

export class QuietHoursService {
  /**
   * Check if current time is within user's quiet hours
   */
  isInQuietHours(preferences: UserPreferences, currentTime: Date = new Date()): boolean {
    if (!preferences.quiet_hours_enabled) {
      return false;
    }

    try {
      // For simplicity, we'll work in UTC for now
      // In a production environment, you'd want proper timezone handling
      const currentHour = currentTime.getUTCHours();
      const currentMinute = currentTime.getUTCMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;

      // Parse start and end times
      const [startHour, startMinute] = preferences.quiet_hours_start.split(':').map(Number);
      const [endHour, endMinute] = preferences.quiet_hours_end.split(':').map(Number);
      
      const startTimeMinutes = startHour * 60 + startMinute;
      const endTimeMinutes = endHour * 60 + endMinute;

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startTimeMinutes > endTimeMinutes) {
        return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
      }
      
      // Handle same-day quiet hours (e.g., 13:00 to 17:00)
      return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
    } catch (error) {
      logger.error('Error checking quiet hours:', error);
      return false;
    }
  }

  /**
   * Calculate when quiet hours end for scheduling delayed notifications
   */
  getQuietHoursEndTime(preferences: UserPreferences, currentTime: Date = new Date()): Date {
    try {
      const [endHour, endMinute] = preferences.quiet_hours_end.split(':').map(Number);
      
      // Create end time in UTC
      const endTime = new Date(currentTime);
      endTime.setUTCHours(endHour, endMinute, 0, 0);
      
      // If end time is before current time, it's tomorrow
      if (endTime <= currentTime) {
        endTime.setUTCDate(endTime.getUTCDate() + 1);
      }
      
      return endTime;
    } catch (error) {
      logger.error('Error calculating quiet hours end time:', error);
      // Fallback: delay by 8 hours
      const fallback = new Date(currentTime);
      fallback.setUTCHours(fallback.getUTCHours() + 8);
      return fallback;
    }
  }

  /**
   * Determine notification priority based on content and type
   */
  determineNotificationPriority(payload: NotificationPayload): NotificationPriority {
    // Critical: Last day reminders for paid subscriptions
    if (payload.reminderType === 'renewal' && payload.daysBefore <= 1) {
      return 'critical';
    }
    
    // Critical: Trial expiring today
    if (payload.reminderType === 'trial_expiry' && payload.daysBefore <= 0) {
      return 'critical';
    }
    
    // High: Trial expiring within 2 days
    if (payload.reminderType === 'trial_expiry' && payload.daysBefore <= 2) {
      return 'high';
    }
    
    // High: Renewal within 3 days
    if (payload.reminderType === 'renewal' && payload.daysBefore <= 3) {
      return 'high';
    }
    
    // Normal: Standard reminders
    if (payload.reminderType === 'renewal' || payload.reminderType === 'trial_expiry') {
      return 'normal';
    }
    
    // Low: Cancellation reminders
    if (payload.reminderType === 'cancellation') {
      return 'low';
    }
    
    return 'normal';
  }

  /**
   * Check if notification should be sent during quiet hours
   */
  shouldSendDuringQuietHours(
    preferences: UserPreferences, 
    payload: NotificationPayload,
    currentTime: Date = new Date()
  ): QuietHoursCheck {
    if (!this.isInQuietHours(preferences, currentTime)) {
      return {
        isQuietHours: false,
        shouldDelay: false,
      };
    }

    const priority = this.determineNotificationPriority(payload);
    
    // Always allow critical alerts during quiet hours
    if (priority === 'critical') {
      return {
        isQuietHours: true,
        shouldDelay: false,
        reason: 'Critical alert allowed during quiet hours',
      };
    }
    
    // If user allows only critical alerts, delay non-critical ones
    if (preferences.critical_alerts_only) {
      const delayUntil = this.getQuietHoursEndTime(preferences, currentTime);
      return {
        isQuietHours: true,
        shouldDelay: true,
        delayUntil,
        reason: `Non-critical alert delayed until ${delayUntil.toISOString()}`,
      };
    }
    
    // User allows all alerts during quiet hours
    return {
      isQuietHours: true,
      shouldDelay: false,
      reason: 'User allows all alerts during quiet hours',
    };
  }

  /**
   * Check if it's an appropriate time to send delayed notifications
   */
  isAppropriateTimeForDelayedNotifications(
    preferences: UserPreferences,
    currentTime: Date = new Date()
  ): boolean {
    if (!preferences.quiet_hours_enabled) {
      return true;
    }

    // Don't send during quiet hours
    if (this.isInQuietHours(preferences, currentTime)) {
      return false;
    }

    try {
      // For simplicity, work in UTC for now
      const currentHour = currentTime.getUTCHours();
      
      // Send delayed notifications between 8 AM and 10 PM UTC
      return currentHour >= 8 && currentHour < 22;
    } catch (error) {
      logger.error('Error checking appropriate time for delayed notifications:', error);
      return true; // Default to allowing notifications
    }
  }
}

export const quietHoursService = new QuietHoursService();