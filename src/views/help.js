import { barOnly, pageScreens } from '../mode.js';
import { $ } from '../lib/format.js';

const go = (v, label) => `<button class="linkbtn" data-act="nav" data-v="${v}">${label}</button>`;

// Plain-language steps for business managers. No user text goes into this page.
export function viewHelp() {
  $('#main').innerHTML =
    `<header class="ph"><h1>How to use FACTS</h1><p class="sub">From a new school to an uploaded BAR, in seven steps.</p></header>
  <section class="panel"><h2>1. First time: add your school</h2><ol>
  <li>Open ${go('schools', 'Schools')} and add your school: its name, the layout of its account codes, the district/parent code and its funds.</li>
  <li>Choose the school in the sidebar. Each school keeps its own reports and BARs, and they never mix.</li></ol></section>
  <section class="panel"><h2>2. Load reports</h2><ol>
  <li>Open ${go('import', 'Load reports')}. Pick the school and fiscal year.</li>
  <li>Drop the AptaFund Account Summary (.xlsx), then the Fund Audit (.csv). Run both for the whole fiscal year and all accounts.</li>
  <li>A red Stop means the file does not fit the school; fix the file or the school. An amber warning (wrong year, short date range, filtered report, totals that do not match) can be accepted if you know why.</li></ol></section>
  <section class="panel"><h2>3. Build a BAR</h2><ol>
  <li>Open ${go('bars', 'BAR Builder')}. Pick the funds you are working in.</li>
  <li><b>Transfer:</b> choose an over-budget function and "Build a transfer". FACTS takes from other functions of the same fund that have room. Change any amount.</li>
  <li><b>Maintenance:</b> moves money within one function. <b>Increase, Initial Budget and Decrease:</b> add a revenue line (object 4xxxx) and the expenditure lines; the two must match. Type the award amount to be warned about any difference.</li>
  <li>Each BAR is for one fund. Make a separate BAR for each fund.</li></ol></section>
  <section class="panel"><h2>4. Check and download</h2><ol>
  <li>Read the checks under the lines. Every item marked Stop must be fixed before the file can be made.</li>
  <li>Add the contact name and the justification (the Suggest wording button gives a start). Use plain words: no commas, quotes or pipes, 255 characters at most.</li>
  <li>Check the file name (it starts with the school's short name from the Schools screen; you can type a different one), then choose "Download the OBMS upload file".</li>
  <li>Optional: under "Longer narrative", there is a template for each BAR type (for a Transfer FACTS suggests one; you can change it). Press "Fill from this BAR", then edit the wording. If you change the BAR's lines afterward, a warning says the narrative may be out of date. The narrative is for your records and the PED explanation; it is not part of the upload file.</li></ol></section>
  <section class="panel"><h2>5. Upload in OBMS</h2><ol>
  <li>In OBMS, open BAR Uploads and upload the file.</li>
  <li>Back in FACTS, choose Save BAR, type the Document ID OBMS gives you, and add statuses as it moves through OBMS (Uploaded - Staging Validated, Create Direct BAR, BM Approved ... BS Approval - PED Approval).</li>
  <li>From Uploaded - Staging Validated on, the BAR's lines are frozen so they match what you sent. To change it, make a new BAR.</li></ol></section>
  <section class="panel"><h2>6. Back up</h2><ol>
  <li>Your BARs live only in this browser. Choose "Download a backup" on the BAR Builder regularly and keep the file safe.</li>
  <li>To restore, choose "Restore from a backup". If a BAR differs from the one here, you choose which to keep. Reports are not in the backup: load them again.</li></ol></section>
  <section class="panel"><h2>7. If OBMS rejects a file</h2><ol>
  <li>Write down OBMS's message word for word.</li>
  <li>Fix the BAR in FACTS, download again and upload again.</li>
  <li>Email the message to <a href="mailto:tim.nguyen@vertexeducation.com">tim.nguyen@vertexeducation.com</a>, so the check can be added. See ${go('about', 'About and privacy')} for what FACTS cannot promise.</li></ol></section>
${
  !barOnly() || pageScreens().has('jem')
    ? `<section class="panel"><h2>8. Journal Entry Maker</h2><ol>
  <li>For a reclass of actuals: fill in any parts of the account code to list the charges (a short value matches everything that starts with it; the text box also searches names and detail), type only the parts of each account code that change, type how much of each charge to move, and choose Make the entries. Each entry is dated the last day of the charge's month, and a reclass between funds goes through each fund's bank account (set on the Schools screen).</li>
  <li>For an approved BAR: load PED's approved Budget Adjustment Request Report as an Excel file. Decreases are credits and increases are debits, dated with the last PED approval date.</li>
  <li>Load the school's AptaFund Chart Of Accounts report and PED's Chart Line Listing (the zip or its CSVs) once per year; FACTS then lists any account strings you must add in AptaFund first and stops codes PED does not allow.</li>
  <li>Copy the lines or download the Excel, key the entry into AptaFund, then save it here and add its status and AptaFund number. Charges you already reclassed are not offered twice. FACTS does not make Encumbrance entries; AptaFund does those.</li></ol></section>`
    : ''
}`;
}
