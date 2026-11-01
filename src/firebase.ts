import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

const ALLOCATIONS_DOC_PATH = 'line_allocations';
const ALLOCATIONS_DOC_ID = 'current';

export const saveLineAllocationsToFirestore = async (
  allocations: Record<string, string[]>,
  updatedBy: string = 'planner'
): Promise<void> => {
  try {
    const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
    await setDoc(docRef, {
      allocations,
      updatedAt: new Date().toISOString(),
      updatedBy,
    }, { merge: true });
  } catch (error) {
    console.error('Error saving line allocations to Firestore:', error);
    throw error;
  }
};

export const subscribeToLineAllocations = (
  onUpdate: (allocations: Record<string, string[]>, updatedAt?: string, updatedBy?: string) => void,
  onError?: (error: Error) => void
) => {
  const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.allocations) {
          onUpdate(data.allocations, data.updatedAt, data.updatedBy);
        }
      }
    },
    (err) => {
      console.warn('Firestore snapshot error for line allocations:', err);
      if (onError) onError(err);
    }
  );
};

export const fetchLineAllocationsFromFirestore = async (): Promise<Record<string, string[]> | null> => {
  try {
    const docRef = doc(db, ALLOCATIONS_DOC_PATH, ALLOCATIONS_DOC_ID);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return (data?.allocations as Record<string, string[]>) || null;
    }
    return null;
  } catch (error) {
    console.warn('Error fetching line allocations from Firestore:', error);
    return null;
  }
};
