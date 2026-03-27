import { logActivity, ActionType, EntityType } from '../services/activityLogService';
import { User, getCurrentUser } from '../services/userService';

/**
 * ============================================================================
 * ACTIVITY LOGGER UTILITY
 * ============================================================================
 *
 * Helper functions pour logger automatiquement les activités
 */

/**
 * Wrapper pour logger automatiquement une action
 * Usage:
 *   const result = await withActivityLog(
 *     'update', 'client', clientId, clientName,
 *     async () => { ... operation ... },
 *     user
 *   );
 */
export async function withActivityLog<T>(
  action: ActionType,
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  user?: User,
  options?: {
    description?: string;
    changes?: {
      before: any;
      after: any;
      fields_changed: string[];
    };
    metadata?: Record<string, any>;
  }
): Promise<T> {
  try {
    // Execute operation
    const result = await operation();

    // Get user (from parameter or current user)
    const currentUser = user || getCurrentUser();
    if (!currentUser) {
      console.warn('[ActivityLogger] No user found, skipping log');
      return result;
    }

    // Log activity (non-blocking)
    logActivity({
      user_id: currentUser.id,
      user_email: currentUser.email,
      user_name: currentUser.display_name,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      description: options?.description || `${action} ${entityType} ${entityName}`,
      changes: options?.changes,
      metadata: options?.metadata
    }).catch(error => {
      console.error('[ActivityLogger] Failed to log activity:', error);
    });

    return result;
  } catch (error) {
    console.error('[ActivityLogger] Operation failed:', error);
    throw error;
  }
}

/**
 * Helper pour logger une création
 */
export async function logCreate<T>(
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  user?: User
): Promise<T> {
  return withActivityLog(
    'create',
    entityType,
    entityId,
    entityName,
    operation,
    user,
    {
      description: `Created ${entityType} "${entityName}"`
    }
  );
}

/**
 * Helper pour logger une mise à jour
 */
export async function logUpdate<T>(
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  before: any,
  after: any,
  fieldsChanged: string[],
  user?: User
): Promise<T> {
  return withActivityLog(
    'update',
    entityType,
    entityId,
    entityName,
    operation,
    user,
    {
      description: `Updated ${entityType} "${entityName}" (${fieldsChanged.join(', ')})`,
      changes: {
        before,
        after,
        fields_changed: fieldsChanged
      }
    }
  );
}

/**
 * Helper pour logger une suppression
 */
export async function logDelete<T>(
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  user?: User
): Promise<T> {
  return withActivityLog(
    'delete',
    entityType,
    entityId,
    entityName,
    operation,
    user,
    {
      description: `Deleted ${entityType} "${entityName}"`
    }
  );
}

/**
 * Helper pour logger un envoi d'email
 */
export async function logEmailSent<T>(
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  emailTo: string,
  user?: User
): Promise<T> {
  return withActivityLog(
    'send_email',
    entityType,
    entityId,
    entityName,
    operation,
    user,
    {
      description: `Sent email to ${emailTo} for ${entityType} "${entityName}"`,
      metadata: {
        email_sent_to: emailTo
      }
    }
  );
}

/**
 * Helper pour logger un changement de statut
 */
export async function logStatusChange<T>(
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  oldStatus: string,
  newStatus: string,
  user?: User
): Promise<T> {
  return withActivityLog(
    'status_change',
    entityType,
    entityId,
    entityName,
    operation,
    user,
    {
      description: `Changed ${entityType} "${entityName}" status from "${oldStatus}" to "${newStatus}"`,
      changes: {
        before: { status: oldStatus },
        after: { status: newStatus },
        fields_changed: ['status']
      }
    }
  );
}

/**
 * Helper pour logger une génération AI
 */
export async function logAIGenerate<T>(
  entityType: EntityType,
  entityId: string,
  entityName: string,
  operation: () => Promise<T>,
  aiModel: string,
  user?: User
): Promise<T> {
  return withActivityLog(
    'ai_generate',
    entityType,
    entityId,
    entityName,
    operation,
    user,
    {
      description: `AI generated content for ${entityType} "${entityName}" using ${aiModel}`,
      metadata: {
        ai_model_used: aiModel
      }
    }
  );
}

/**
 * Helper pour logger un export
 */
export async function logExport<T>(
  entityType: EntityType,
  operation: () => Promise<T>,
  exportType: string,
  user?: User
): Promise<T> {
  return withActivityLog(
    'export',
    entityType,
    'export',
    `${exportType} export`,
    operation,
    user,
    {
      description: `Exported ${entityType} data as ${exportType}`
    }
  );
}

/**
 * Helper pour logger un login
 */
export async function logLogin(user: User): Promise<void> {
  try {
    await logActivity({
      user_id: user.id,
      user_email: user.email,
      user_name: user.display_name,
      action: 'login',
      entity_type: 'user',
      entity_id: user.id,
      entity_name: user.display_name,
      description: `User ${user.display_name} logged in`
    });
  } catch (error) {
    console.error('[ActivityLogger] Failed to log login:', error);
  }
}
