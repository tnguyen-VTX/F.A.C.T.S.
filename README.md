# FACTS

Financial Analysis & Control Tracking System for Gilbert L. Sena Charter High School.

```bash
npm install
npm run dev      # open the local URL and drop in the FACTS workbook
npm test         # put a copy of the workbook at fixtures/facts.xlsx first for the data tests
npm run build    # static site in dist/
```

The workbook is read in the browser and never uploaded. See CLAUDE.md for architecture and domain notes, and DEPLOY.md for putting the BAR Builder on a website.

On Windows, double-click `start-bar-builder.bat` to get the latest version (needs Git and Node.js installed) and start the BAR Builder. While it is running, `git pull` alone updates the open page.
