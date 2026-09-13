import mongoose from 'mongoose';
import { getControlConnection } from './controlPlane.js';

/**
 * Control-plane schemas. These are registered on the CONTROL connection only.
 * They never live in a tenant database.
 */

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },          // "Canara Engineering College"
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true }, // "canara"
    dbName: { type: String, required: true, unique: true },       // "evalai_t_canara"
    status: {
      type: String,
      enum: ['provisioning', 'active', 'suspended', 'offboarded'],
      default: 'provisioning',
      index: true,
    },
    plan: { type: String, enum: ['essentials', 'institution', 'university', 'enterprise'], default: 'institution' },
    limits: {
      maxStudents: { type: Number, default: null },     // null = unlimited
      maxCoursesActive: { type: Number, default: null },
    },
    branding: {
      displayName: { type: String },
      logoUrl: { type: String },
      programme: { type: String },
    },
    contact: {
      adminName: { type: String },
      adminEmail: { type: String },
    },
    schemaVersion: { type: Number, default: 0 }, // for the migration runner
    activatedAt: { type: Date },
    suspendedAt: { type: Date },
  },
  { timestamps: true }
);

const subscriptionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled'],
      default: 'trialing',
      index: true,
    },
    plan: { type: String, enum: ['essentials', 'institution', 'university', 'enterprise'] },
    gatewayCustomerId: { type: String },       // Razorpay customer id (billing in Phase 3)
    gatewaySubscriptionId: { type: String },
    currentPeriodEnd: { type: Date },          // access lapses after this if not renewed
  },
  { timestamps: true }
);

const superAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['superadmin'], default: 'superadmin' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const provisioningJobSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
    action: { type: String, enum: ['create', 'suspend', 'reactivate', 'offboard', 'migrate'] },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    error: { type: String },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

// Bind to the control connection. Lazy so we don't touch the connection at import.
let bound = null;
export function controlModels() {
  if (bound) return bound;
  const conn = getControlConnection();
  bound = {
    Tenant: conn.models.Tenant || conn.model('Tenant', tenantSchema),
    Subscription: conn.models.Subscription || conn.model('Subscription', subscriptionSchema),
    SuperAdmin: conn.models.SuperAdmin || conn.model('SuperAdmin', superAdminSchema),
    ProvisioningJob: conn.models.ProvisioningJob || conn.model('ProvisioningJob', provisioningJobSchema),
  };
  return bound;
}
