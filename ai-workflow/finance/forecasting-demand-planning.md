---
name: forecasting-demand-planning
description: Build a revenue forecast and demand plan for a small or growing business using both top-down (market, share, targets) and bottom-up (pipeline, capacity, unit economics) methods, then reconcile them. Use when someone asks for a forecast, sales projection, budget, demand plan, capacity plan, fleet or headcount plan, target setting, scenario plan (base, low, high), or asks "how much will we sell", "how many units do we need" or "is this target realistic".
---

# Forecasting and demand planning: top-down and bottom-up

Produces a forecast people can plan against: built two ways, reconciled, with every assumption written down and a range rather than a single number. Written for owner-run businesses where the data is thin (a year or two of history, a CRM of uneven quality, a fixed amount of kit or people), so the method matters more than the maths.

## Rules

1. **Two methods, always.** Top-down says what the market and the ambition allow. Bottom-up says what the pipeline, capacity and conversion rates can deliver. Neither alone is a forecast. The gap between them is the most useful number in the plan.
2. **Every number is either data or a named assumption.** Label each input: actual (with source and period), benchmark (with source) or assumption (with who owns it). Never invent history or a market size; if it's missing, say so and make it an assumption.
3. **A range, not a point.** Give low, base and high, each built from changed assumptions you can name, not by adding ±10%.
4. **Capacity caps demand.** You can't sell more hire days than units × available days, or more jobs than people can deliver. Constrained demand is the forecast; unconstrained demand is the opportunity.
5. **Forecasts are not targets.** A target is what we want; a forecast is what we expect. Keep them in separate columns and show the gap.
6. **Plan the review, not just the number.** Set when actuals get compared, which leading indicators get watched, and what triggers a re-forecast.

## Order of work

### 1. Frame it
- Purpose: budget, cash plan, capacity or fleet decision, hiring, investor pack or target setting. This sets the horizon and detail.
- Horizon and grain: months for the next 12, quarters beyond. By product, channel, region or customer segment only where decisions differ.
- Unit of demand: the thing that is sold and constrained (hire days, units on hire, jobs, covers, deals, subscribers). Revenue = units × price; plan the units first.

### 2. Gather the inputs
- Actuals: at least 12 months by month if they exist (revenue by line, volumes, prices), from the accounts or booking system. Check them against the P&L, and remove one-offs and miscoded items first (see [`pnl-analysis`](pnl-analysis.md)).
- Pipeline: open deals or quotes with stage, value, expected date and source, from the CRM.
- Conversion: historic stage-to-win rates and sales cycle length. If the CRM is too thin, use a stated assumption and flag it.
- Capacity: units, people, hours, sites and their availability (maintenance, builds, seasonality, travel days).
- Market: size, growth, number of events or buyers, competitor share, with sources. Where none exist, an explicit estimate.
- Price: current rate card, discounts actually given, planned changes.
- Seasonality: monthly pattern from history, or from the market (events season, holidays) when history is short.

### 3. Top-down
Start from the outside and narrow:
1. **Total market** (TAM): e.g. number of relevant events or buyers × typical annual spend on this category.
2. **Reachable market** (SAM): the part you can actually serve (geography, size, product fit).
3. **Achievable share** (SOM): a share you can justify from evidence: last year's share, win rate on qualified leads, sales capacity, a comparable competitor.
4. Spread the annual figure across months with the seasonality curve.
5. Alternatives where market data is thin: last year × growth rate (with the reason for the rate), or the target/ambition, labelled as such.

Top-down is good for ambition, sense-checking and long horizons. Its weakness is that it can't see capacity or pipeline.

### 4. Bottom-up
Build from what you can count:
1. **Committed:** signed bookings and contracts, by month, at contracted value.
2. **Weighted pipeline:** open deals × stage probability, placed in the month they'd deliver (not close).
3. **Run rate / repeat:** repeat customers and recurring work, from history, with churn.
4. **New business not yet in the pipeline:** leads per month × lead-to-win rate × average value, lagged by the sales cycle. This is the most assumption-heavy layer; keep it separate.
5. **Apply capacity:** convert demand into units by month and cap it at what the business can supply. Record demand that was turned away or deferred.
6. Price it: units × realised price (after the discounts actually given).

Bottom-up is good for the next 3 to 6 months and for operational planning. Its weakness is that it under-forecasts the later months, when the pipeline hasn't been built yet.

### 5. Reconcile
- Put both side by side by month and quarter. Expect bottom-up to be higher near-term (committed work) and lower later (empty pipeline). That's normal; the gap later on is the **pipeline you still need to create**.
- Turn the gap into sales activity: gap ÷ average deal value ÷ win rate = qualified leads needed, by month, allowing for the sales cycle.
- If top-down is far above bottom-up all year, the target or the share assumption is unrealistic, or capacity is the limit. Say which.
- If bottom-up is above top-down, check for double counting, over-optimistic probabilities, or a market estimate that's too small.
- The **base case** usually takes bottom-up for the near months and blends towards a supported top-down figure later. Write down the rule you used.

### 6. Scenarios and sensitivity
- Low, base, high: change the named drivers (win rate, price, utilisation, number of events, a big customer won or lost), not the totals.
- Show which two or three assumptions move the answer most (sensitivity). Those are the ones to watch and to firm up.

### 7. Demand into supply and cash
- Capacity plan: units or people needed by month at base and high, utilisation %, and when a new unit or hire must be ordered given its lead time.
- Cash: when revenue becomes cash (deposits, payment terms, staged payments) and when costs are paid. A growing forecast often needs more cash, not less.
- Decision points: "if confirmed bookings for Q2 pass X by date Y, order another unit".

### 8. Track and re-forecast
- Monthly: forecast vs actual by driver (volume, price, mix), not just total.
- Leading indicators: quotes sent, pipeline value created, win rate, average lead time to delivery, enquiries.
- Accuracy: track the error (actual vs forecast %) each month; a forecast that's always high or always low has a bias to fix.
- Roll the forecast forward each month so it always covers the next 12 months.

## Rental and hire specifics
- Demand unit is unit-days on hire. Capacity = units × days available (less builds, maintenance, transport days between hires).
- Utilisation = days on hire ÷ days available. Plan against a realistic ceiling (rarely above 70 to 80% once turnaround is counted).
- Peak months fill first and fix the fleet size; off-peak demand is where price and long hires matter.
- Lead time: bookings for events come months ahead; use the "booked so far vs same point last year" curve (booking pace) as the best near-term predictor.
- Revenue spreads over the hire period; deposits aren't revenue.

## Other notes
- **Services and agencies:** demand unit is billable days or projects; capacity is people × utilisation.
- **Creators and brand deals:** forecast deals by tier and season (Q4 heavy), using the conversion from pitch to signed and the average fee per format; agency fees come off before cash.
- **Product or stock businesses:** forecast units by SKU family, then stock and reorder points from lead time and safety stock.

## Output format
1. **Headline:** base-case revenue and units for the period, the range, and the single biggest risk.
2. **Assumptions table:** every input, labelled actual / benchmark / assumption, with source or owner.
3. **Top-down vs bottom-up:** by month or quarter, with the gap and what closes it (leads needed).
4. **Scenarios:** low, base, high, with the drivers changed.
5. **Capacity and cash:** utilisation, units or people needed, order-by dates, cash timing.
6. **Watch list:** leading indicators, review date and re-forecast triggers.
Build the model in a spreadsheet when one is wanted, with inputs on one tab, workings on another and outputs on a third, and every input cell labelled.

## Failure modes

| Mistake | Avoid it by |
|---|---|
| One method only | Always build both and show the gap |
| Hockey stick in later months | Check the late months against pipeline creation and capacity |
| Pipeline counted at close date | Place weighted value in the delivery month |
| Ignoring capacity | Cap demand; record turned-away demand separately |
| ±10% "scenarios" | Change named drivers |
| Forecast set equal to target | Separate columns, show the gap |
| History used without cleaning | Remove one-offs and miscoded items first |
| Never revisited | Monthly actual vs forecast by driver, rolling 12 months |
