export type Category = { id: string; label: string; emoji: string; pattern?: RegExp };

/** What an expense was for. The id is stored with the expense; labels and emoji can change freely. */
export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', emoji: '🍽️', pattern: /dinner|lunch|breakfast|food|restaurant|meal|pizza|biryani|thali|dosa|zomato|swiggy/i },
  { id: 'drinks', label: 'Snacks', emoji: '☕', pattern: /tea|chai|coffee|drink|juice|beer|snack|ice ?cream|coconut/i },
  { id: 'groceries', label: 'Groceries', emoji: '🛒', pattern: /grocer|vegetable|fruit|milk|supermarket|kirana|water|blinkit|zepto|bigbasket|instamart|dmart/i },
  { id: 'stay', label: 'Stay', emoji: '🏨', pattern: /hotel|villa|stay|room|resort|rent|airbnb|homestay|lodge|oyo/i },
  { id: 'cab', label: 'Cab & auto', emoji: '🚕', pattern: /cab|taxi|auto|uber|ola|rapido|car hire|rickshaw/i },
  { id: 'fuel', label: 'Fuel & tolls', emoji: '⛽', pattern: /fuel|petrol|diesel|toll|fastag|parking|cng|hpcl|bpcl|indian ?oil/i },
  { id: 'flight', label: 'Flights', emoji: '✈️', pattern: /flight|plane|airfare|airline|airport|indigo|air india|akasa/i },
  { id: 'train', label: 'Train', emoji: '🚆', pattern: /train|railway|irctc|metro/i },
  { id: 'bus', label: 'Bus', emoji: '🚌', pattern: /\bbus\b|volvo|coach/i },
  { id: 'tickets', label: 'Tickets & entry', emoji: '🎟️', pattern: /ticket|entry|museum|fort|temple|movie|show|pass/i },
  { id: 'activities', label: 'Activities', emoji: '🏄', pattern: /boat|ride|safari|tour|trek|scuba|parasail|rafting|guide|cruise/i },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', pattern: /shop|souvenir|cloth|market|amazon|flipkart|myntra/i },
  { id: 'gifts', label: 'Gifts', emoji: '🎁', pattern: /gift|present|donation/i },
  { id: 'medical', label: 'Medical', emoji: '💊', pattern: /medic|doctor|pharma|hospital|chemist|apollo/i },
  { id: 'party', label: 'Party', emoji: '🎉', pattern: /party|celebrat|cake|birthday|club|bar\b/i },
  { id: 'other', label: 'Other', emoji: '🧾' },
];

const OTHER = CATEGORIES[CATEGORIES.length - 1];

/** A best guess from the description, used until someone picks a category. */
export function guessCategory(description: string): Category {
  return CATEGORIES.find((category) => category.pattern?.test(description)) ?? OTHER;
}

/** The category an expense shows with: the one picked, or a guess for expenses saved before categories existed. */
export function categoryOf(expense: { category?: string; description: string }): Category {
  return CATEGORIES.find((category) => category.id === expense.category) ?? guessCategory(expense.description);
}
