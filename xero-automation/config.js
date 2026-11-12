// Non-secret configuration. Secrets (API keys, tokens) never go in this repo.
module.exports = {
  xero: {
    organisation: 'Acme Hire Limited',
    organisationId: '00000000-0000-0000-0000-000000000000',
    // Bank account the matcher records payments against. Two Revolut GBP accounts exist;
    // all customer receipts seen so far use "Revolut GBP Main". Confirm with Finance.
    revolutMainAccountId: 'cdb40aec-4ce2-4c31-aaed-d3371bb95262',
    revolutOtherAccountId: '3568c1b5-c8f9-40b8-b937-a827c4ea832f',
  },
};
