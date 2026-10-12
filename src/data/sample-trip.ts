import type { Trip } from '@/domain';

const everyone = [
  'rajesh', 'sunita', 'aarav', 'diya',
  'mahesh', 'kiran', 'nisha',
  'venkat', 'lakshmi', 'arjun', 'meera', 'kavya',
];

/** Made-up trip used until real data storage exists. */
export const sampleTrip: Trip = {
  families: [
    { id: 'sharma', name: 'Sharma', headId: 'rajesh' },
    { id: 'patel', name: 'Patel', headId: 'mahesh' },
    { id: 'iyer', name: 'Iyer', headId: 'venkat' },
  ],
  members: [
    { id: 'rajesh', name: 'Rajesh', familyId: 'sharma' },
    { id: 'sunita', name: 'Sunita', familyId: 'sharma' },
    { id: 'aarav', name: 'Aarav', familyId: 'sharma' },
    { id: 'diya', name: 'Diya', familyId: 'sharma' },
    { id: 'mahesh', name: 'Mahesh', familyId: 'patel' },
    { id: 'kiran', name: 'Kiran', familyId: 'patel' },
    { id: 'nisha', name: 'Nisha', familyId: 'patel' },
    { id: 'venkat', name: 'Venkat', familyId: 'iyer' },
    { id: 'lakshmi', name: 'Lakshmi', familyId: 'iyer' },
    { id: 'arjun', name: 'Arjun', familyId: 'iyer' },
    { id: 'meera', name: 'Meera', familyId: 'iyer' },
    { id: 'kavya', name: 'Kavya', familyId: 'iyer' },
  ],
  expenses: [
    {
      id: 'e1',
      description: 'Villa booking',
      amount: 3600000,
      paidBy: { rajesh: 3600000 },
      split: { type: 'perFamily', familyIds: ['sharma', 'patel', 'iyer'] },
    },
    {
      id: 'e2',
      description: 'Dinner at the beach',
      amount: 840000,
      paidBy: { kiran: 840000 },
      split: { type: 'equal', memberIds: everyone },
    },
    {
      id: 'e3',
      description: 'Cabs',
      amount: 450000,
      paidBy: { venkat: 450000 },
      split: { type: 'equal', memberIds: everyone },
    },
    {
      id: 'e4',
      description: 'Boat ride',
      amount: 300000,
      paidBy: { arjun: 300000 },
      split: { type: 'shares', shares: { arjun: 1, meera: 1, kavya: 0.5, aarav: 1, diya: 0.5, nisha: 1 } },
    },
    {
      id: 'e5',
      description: 'Groceries',
      amount: 275000,
      paidBy: { sunita: 175000, mahesh: 100000 },
      split: { type: 'equal', memberIds: everyone },
    },
  ],
  payments: [],
};
