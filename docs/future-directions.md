# Future Directions

Possible capability directions for the neighborhood app. These are not commitments or designs — they are a backlog of ideas to draw from when planning future work.

## Immediate priority

- **Mobile-friendly UI** — current layout is desktop-only. All future work should be mobile-first.

## Neighborhood view enhancements

- **Circle diagram** — visual representation of neighborhood data where circle sizes encode activity counts or participation numbers. Opens from the neighborhood detail view.

- **Names list** — clicking an activity count opens a list of the people behind that number. Supports adding and removing names. Connects the quantitative data to the actual individuals.

- **Link to source spreadsheet** — direct link from the neighborhood view to the corresponding row or range in the master Google Sheet, for users who want to work in the sheet directly.

## Cross-neighborhood views

- **Multi-neighborhood comparison** — ability to select several neighborhoods and view their data side by side, or aggregated. Useful for cluster-level planning.

## Communication

- **Message neighborhood contact** — initiate contact with a neighborhood's assigned contact from within the app. Channel TBD (email, WhatsApp, SMS, or other). Could be as simple as a mailto link or as integrated as an in-app compose flow.

## Data integrity

- **Neighborhood name uniqueness** — current system uses neighborhood name as the join key between the master sheet and SRP cache. Once the same name appears in multiple clusters this breaks. Needs cluster + name composite key throughout.

## Infrastructure

- **SRP cache scheduling** — automated periodic refresh of the Devotionals and Education cache tabs rather than manual scraper runs.

- **TOTP automation for SRP scraper** — if a dedicated SRP account is registered with 2FA, capture the TOTP secret to automate code generation and allow headless scraping.
