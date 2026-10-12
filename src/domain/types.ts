/** Money is always an integer number of minor units (paise), never a decimal. */
export type Paise = number;

export type Family = {
  id: string;
  name: string;
  /** The member who settles with other families on this family's behalf. */
  headId: string;
};

export type Member = {
  id: string;
  name: string;
  familyId: string;
};

export type Split =
  /** Equal share per person. */
  | { type: 'equal'; memberIds: string[] }
  /** Equal share per family, whatever its size; each family's share is then split equally among its members. */
  | { type: 'perFamily'; familyIds: string[] }
  /** Weighted shares per person, e.g. 1 for an adult and 0.5 for a child. */
  | { type: 'shares'; shares: Record<string, number> }
  /** Exact amount per person; must add up to the expense amount. */
  | { type: 'exact'; amounts: Record<string, Paise> };

export type Expense = {
  id: string;
  description: string;
  amount: Paise;
  /** Who paid and how much; must add up to `amount`. */
  paidBy: Record<string, Paise>;
  split: Split;
};

/** Money actually handed over, between heads or inside a family. */
export type Payment = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: Paise;
};

export type Trip = {
  families: Family[];
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
};

export type Transfer = {
  fromMemberId: string;
  toMemberId: string;
  amount: Paise;
};

export type FamilyTransfer = Transfer & {
  fromFamilyId: string;
  toFamilyId: string;
};
