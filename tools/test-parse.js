// Dev check for parseDetails.  node tools/test-parse.js
const { parseDetails } = await import('../public/extract.js');
const doc = `CONTRACTUAL CHANGE REQUEST
P/N: 0123456789
Policy Owner: Tan Mei Ling
NRIC: 900101071234
Mobile: 012-345 6789
Email: meiling.tan@example.com
Life Assured: Lim Xin Yi
LA NRIC: 150505-07-5678
Nominee 1
Name: Lim Ah Kow
NRIC: 850505-07-5671
Relationship: Husband
Share: 60%
Nominee 2
Name: Lim Xin Er
NRIC 170303075674
Relationship - Daughter
Share 40 %
Trustee
Name: Wong Siew Lan
NRIC No.: 780315-08-5432
Relationship: Sister
Tel: 016-778 1234
Agent
Name: Lim Ai Leng
Agent code: AG12345`;
console.log(parseDetails(doc));
console.log(parseDetails('P/N 9876543210\nName: Ahmad bin Ismail\nIC: 820720025677\nHP: 0194567788'));
