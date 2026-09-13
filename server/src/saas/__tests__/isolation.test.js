/**
 * CROSS-TENANT ISOLATION TEST SUITE
 * =================================
 * This is the single most important test file in the SaaS build. It proves that
 * data created in one tenant's database is NOT reachable through another tenant's
 * connection. If any test here fails, GO-LIVE IS BLOCKED.
 *
 * REQUIREMENTS TO RUN (cannot run in the build sandbox — needs a real MongoDB):
 *   - A reachable MongoDB (set TENANT_DB_BASE_URI and CONTROL_DB_URI)
 *   - Run with: node --test src/saas/__tests__/isolation.test.js
 *
 * The suite provisions two throwaway tenants, writes distinct data to each, and
 * asserts that each tenant's models only ever see their own data.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { connectControlPlane, disconnectControlPlane } from '../controlPlane.js';
import { controlModels } from '../controlModels.js';
import { getTenantContext, closeAllTenantConnections } from '../tenantConnections.js';
import { provisionTenant } from '../provisioningService.js';

let tenantA, tenantB, ctxA, ctxB;

before(async () => {
  await connectControlPlane();
  // Provision two isolated tenants.
  const a = await provisionTenant({ name: `ISOTEST A ${Date.now()}`, plan: 'university', adminName: 'A Admin', adminEmail: `a_${Date.now()}@iso.test` });
  const b = await provisionTenant({ name: `ISOTEST B ${Date.now()}`, plan: 'university', adminName: 'B Admin', adminEmail: `b_${Date.now()}@iso.test` });
  tenantA = a.tenant; tenantB = b.tenant;
  ctxA = await getTenantContext(tenantA);
  ctxB = await getTenantContext(tenantB);
});

after(async () => {
  // Clean up: drop both test databases and remove control records.
  try { await ctxA.connection.dropDatabase(); } catch { /* ignore */ }
  try { await ctxB.connection.dropDatabase(); } catch { /* ignore */ }
  const { Tenant, Subscription } = controlModels();
  await Subscription.deleteMany({ tenantId: { $in: [tenantA._id, tenantB._id] } });
  await Tenant.deleteMany({ _id: { $in: [tenantA._id, tenantB._id] } });
  await closeAllTenantConnections();
  await disconnectControlPlane();
});

test('a course created in Tenant A is not visible in Tenant B', async () => {
  const courseA = await ctxA.models.Course.create({
    code: 'CS101', title: 'A-only course', department: 'CSE', semester: 3,
  });
  // Tenant B must not see it — neither by find-all nor by direct id lookup.
  const allB = await ctxB.models.Course.find({});
  assert.equal(allB.find((c) => String(c._id) === String(courseA._id)), undefined,
    'LEAK: Tenant B can see Tenant A course in find()');
  const byIdB = await ctxB.models.Course.findById(courseA._id);
  assert.equal(byIdB, null, 'LEAK: Tenant B resolved Tenant A course by id');
});

test('users are isolated per tenant', async () => {
  const beforeB = await ctxB.models.User.countDocuments({});
  await ctxA.models.User.create({ name: 'A user', email: `u_${Date.now()}@iso.test`, passwordHash: 'x', role: 'faculty' });
  const afterB = await ctxB.models.User.countDocuments({});
  assert.equal(beforeB, afterB, 'LEAK: creating a user in A changed B user count');
});

test('exams created in A are not listed in B', async () => {
  const courseA = await ctxA.models.Course.create({ code: 'CS200', title: 'A course 2', department: 'CSE', semester: 4 });
  await ctxA.models.Exam.create({ title: 'A exam', courseId: courseA._id, examType: 'CIE-1', status: 'draft' });
  const examsB = await ctxB.models.Exam.find({});
  assert.equal(examsB.length, 0, 'LEAK: Tenant B sees exams created in Tenant A');
});

test('the two connections point at different databases', async () => {
  assert.notEqual(ctxA.connection.name, ctxB.connection.name,
    'Both tenants resolved to the same database — isolation is broken');
  assert.equal(ctxA.connection.name, tenantA.dbName);
  assert.equal(ctxB.connection.name, tenantB.dbName);
});

test('writes to A do not appear in B even with identical ids attempted', async () => {
  const scoreA = await ctxA.models.Score.create({
    examId: tenantA._id, studentId: tenantA._id, totalScore: 50, subScores: [], orSelections: [],
  });
  const inB = await ctxB.models.Score.findById(scoreA._id);
  assert.equal(inB, null, 'LEAK: a Score id from A resolved in B');
});
