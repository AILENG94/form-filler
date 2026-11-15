# Form Filler

Fills your insurance forms (PDF) automatically from customer details. It runs only on this computer. Layouts and filled forms stay in this folder.

## Start
Double-click **`Start Form Filler.bat`**. The app opens at http://localhost:3456. Keep the black window open while you use it.
(It needs Node.js, which is already installed on this PC.)

## Daily use
1. **Form**: pick the form type and form first.
3. **Upload a picture or PDF:** photos (tilted, shadowed, sideways) are cleaned up and read on this computer; GE "Policy Summary" PDFs are read column by column (name, gender, date of birth, mobile, address lines, postcode/town, nominees). Always glance over the populated fields — a number printed wrongly in the source (e.g. a mobile with no prefix) is copied as it is.
3. **Or customer details from a picture / PDF:** (less reliable, always check) upload a picture or PDF of the customer's details (IC, proposal, form, screenshot), or type / paste them on the right.
   Only the details the chosen form uses are taken from the document; the rest are ignored (tick **Show all details** to take everything).
   Recognised labels include P/N (Policy No.), LA / PO, and sections headed Nominee 1 / Nominee 2 / Trustee.
   Uploads are read on this computer (text recognition runs locally); nothing is sent online. The text found appears under **Paste details** so you can correct it.
   Always check the filled-in fields: pictures that are blurred, angled or have glare can be misread.
   NRIC numbers are always written xxxxxx-xx-xxxx and Malaysian mobile numbers with +60 (e.g. +6012-345 6789). The date of birth and gender fill in from each person's NRIC. Details are not stored; refresh the page to start the next customer.
3. The centre list shows what the form asks for, in the same order as the form (page by page). Click **Show form preview** to see the form with your details on it.
4. **Download filled PDF**.

## How each form is set up
All 34 forms have a saved layout (green **Saved layout** status). Each one fills only that form's own parts:
- **Who goes where:** the form header (Policy No., NRIC, Name of Life Assured) uses the **Life Assured** details. If those are blank, the Policyowner's are used. Owner / claimant / proposer blocks use the **Policyowner / Customer** details. "(if other than Life Assured)" blocks stay blank when it is the same person.
- **Witness blocks** get the **Agent** details. "Trustee / Nominee / Parent" signature blocks get **Trustee 1 / 2** (or **Nominee 1 / 2** when no trustee is entered). Nominee and trustee detail sections (Nomination form, GMBIS nominee form) are filled from Nominee 1 / 2 and Trustee 1 / 2. Assignee, doctor and bank-officer blocks are left blank.
- **Health questions, claim amounts, card numbers, tick-box choices and signatures** are left for the customer or doctor.
- Gender, marital status and nationality tick boxes are ticked from the details where the form has them.
- The Customer details panel shows only the details the chosen form uses, followed by **Other items on this form**: every other blank or tick box the form asks for (e.g. "Are you a Muslim?" Yes/No, "Dated at", mode of payment). Fill in or tick what applies; the preview updates as you go.
- **Agent details are always filled in** (name, IAC/Agent ID, NRIC, date of birth, mobile, address). To change them, edit the Agent section in the panel, or the `value` entries in `public/fields.js`.



## Folders
| Folder | What's in it |
|---|---|
| `Forms/` | Your blank forms. Add new PDFs to the right category folder and they appear in the app. |
| `layouts/` | Saved field positions, one file per form |

## Web version (GitHub Pages)

The `docs/` folder is a static copy of the app (no server). It reads pictures / PDFs in your browser, fills the forms and downloads the PDF; nothing is uploaded. Differences from the computer version: the agent's details are typed once and remembered on that device only.

Rebuild it after changing the app, forms or layouts: `node tools/build-site.js`, then commit and push.

