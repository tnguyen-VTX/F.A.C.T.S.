import { $ } from '../lib/format.js';

// Plain-language page: what runs where, what is stored, and what to double-check.
export function viewAbout() {
  $('#main').innerHTML =
    `<header class="ph"><h1>About, privacy and limits</h1><p class="sub">What FACTS does with your files, and what it cannot promise.</p></header>
  <section class="panel"><h2>Where your data goes</h2>
  <ul><li>Reports are read <b>in your browser</b>. Nothing is uploaded, and the app makes no requests to other sites.</li>
  <li>An award letter PDF is read in this browser by a reader bundled with the app (nothing is sent anywhere) and is not stored; only the BAR you build from it is saved.</li>
  <li>The app keeps school profiles, saved BARs, drafts and the parsed rows of loaded reports in <b>this browser only</b>. Another computer or browser starts empty.</li>
  <li>This site's other tools share this browser storage address, so they could read what is saved here. Do not use a shared or public computer.</li>
  <li>Reports contain employee names and pay. Parsed rows older than 30 days are removed automatically. "Clear loaded reports" removes them at once.</li>
  <li>Use <b>Download a backup</b> on the BAR Builder regularly. It holds profiles, saved BARs, drafts and settings, never reports. Clearing the browser's site data erases everything else.</li></ul></section>
  <section class="panel"><p>Step-by-step instructions are on <button class="linkbtn" data-act="nav" data-v="help">How to use</button>.</p>
  <h2>What to check yourself</h2>
  <ul><li>Compare totals with the AptaFund reports and every BAR with OBMS before you submit. FACTS warns about problems it can see; it cannot see everything.</li>
  <li>The upload file follows the OBMS Import and Export File Specifications v2.1.4. Until a school's first upload has been accepted, its location rule and the FTE formula are unconfirmed.</li>
  <li>A BAR is frozen once it reaches any OBMS step (Uploaded - Staging Validated or later). Prior fiscal years lock after 10/31.</li></ul></section>
  <section class="panel"><h2>Report a problem</h2>
  <p>Email <a href="mailto:tim.nguyen@vertexeducation.com">tim.nguyen@vertexeducation.com</a> with what you did and what you saw. Do not attach reports; they contain employee data.</p></section>
  <section class="panel"><h2>Limits</h2>
  <ul><li>AptaFund reports only: the Account Summary (.xlsx) and the Fund Audit (.csv).</li>
  <li>Use a current desktop browser. Large exports need enough memory.</li>
  <li>No warranty. FACTS helps prepare BARs; you remain responsible for what is submitted.</li></ul></section>`;
}
