import { adminDb } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

export const CREDIT_COSTS = {
  rule_per_turn: 1,
  quick_chaos: 3,
  topic_change: 5,
  call_in: 10,
} as const;

const STARTER_CREDITS = 10;

export class CreditService {
  async ensureUser(uid: string, displayName: string | null): Promise<void> {
    const ref = adminDb.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        displayName: displayName || null,
        credits: STARTER_CREDITS,
        createdAt: FieldValue.serverTimestamp(),
      });
      console.log(`  New user ${uid} — ${STARTER_CREDITS} starter credits`);
    } else if (displayName && snap.data()?.displayName !== displayName) {
      await ref.update({ displayName });
    }
  }

  async getBalance(uid: string): Promise<number> {
    const snap = await adminDb.collection('users').doc(uid).get();
    return snap.data()?.credits ?? 0;
  }

  async deductCredits(uid: string, amount: number, action: string, detail?: string): Promise<boolean> {
    const userRef = adminDb.collection('users').doc(uid);
    return adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const balance = snap.data()?.credits ?? 0;
      if (balance < amount) return false;
      tx.update(userRef, { credits: balance - amount });
      tx.create(adminDb.collection('transactions').doc(), {
        uid,
        type: 'spend',
        amount: -amount,
        action,
        detail: detail || null,
        timestamp: FieldValue.serverTimestamp(),
      });
      return true;
    });
  }

  async addCredits(uid: string, amount: number, stripeSessionId: string): Promise<void> {
    const userRef = adminDb.collection('users').doc(uid);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const balance = snap.data()?.credits ?? 0;
      tx.update(userRef, { credits: balance + amount });
      tx.create(adminDb.collection('transactions').doc(), {
        uid,
        type: 'purchase',
        amount,
        action: 'stripe_purchase',
        detail: stripeSessionId,
        timestamp: FieldValue.serverTimestamp(),
      });
    });
    console.log(`  Credits added: +${amount} for ${uid} (stripe: ${stripeSessionId})`);
  }
}
