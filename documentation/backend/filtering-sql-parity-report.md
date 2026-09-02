# Server-side filtering: real-data parity report (#249, Phase 2)

This documents the verification that the server-side SQL filter translation
(`lib/dashboard/filtering-sql.ts`) reproduces the current in-browser filter
engine (`lib/dashboard/filtering.ts`, `getFilteredData`) exactly, on the live
Neon warehouse.

## Result

- **pg-mem parity (synthetic fixtures):** 28 hand-picked scenarios + 150 seeded-fuzz
  combinations = **178/178 exact** (`tests/unit/filtering-sql-parity.test.ts`).
- **Real-data parity (live warehouse):** **12 single-filter + 60 combined = 72/72 exact**
  (`tests/integration/filtering-sql-realdata.test.ts`, `...-report.test.ts`,
  `...-thorough.test.ts`).

For every scenario the accounts/centers/prospects id-sets (and counts) returned by the
SQL are identical to the engine. Counts below are the filtered-list sizes (what each tab
shows: an account requires ≥1 surviving center when centers are enabled).

## Warehouse snapshot

Accounts: **2,675** · Centers: **6,305** ·
Functions: **13,949** · Tech: **18,735** ·
Prospects: **63,838**

> Counts are specific to this data snapshot and will differ on another instance; the
> invariant to verify anywhere is that engine == sql (and that the numbers match what the
> old UI displayed for the same filters).

## What the data looks like (top values by row frequency)

**Accounts**
- Country: United States (1,557) · United Kingdom (195) · Germany (168) · Japan (104) · France (91) · Switzerland (75)
- Region: North America (1,611) · Europe (762) · APAC (242) · MEA (55) · LATAM (5)
- Industry: Corporate Services (458) · Business Software Solutions (207) · Industrial Manufacturing (174) · Industry-Specific Software (174) · Financial Services (130) · Consumer Product (102)
- Primary category: Hi-Tech (728) · Industrial (261) · IT Service (236) · Professional Services (231) · BFSI (216) · Pharma & Life Sciences (144)
- Primary nature: Services (1,031) · Manufacturing (890) · Software (609) · Retail (63) · Conglomerate (39) · Mining (22)
- NASSCOM: Yes (1,527) · No (1,148)
- HQ employee range: 1K - 5K (640) · 10K - 25K (439) · >50K (395) · 5K - 10K (329) · 25K - 50K (254) · 201 - 500 (212)
- Type: Global Enterprise (2,675) *(single value — cannot discriminate)*

**Centers**
- Type: Manufacturing (1,378) · R&D (998) · IT (854) · GBS (645) · GCC/GIC (583) · CoE (500)
- Focus: Both (3,591) · Global Support Services (1,534) · Local Support Services (1,180)
- City: Bengaluru (1,496) · Pune (738) · Hyderabad (656) · Mumbai (644) · Chennai (564) · Gurugram (501)
- State: Karnataka (1,555) · Maharashtra (1,550) · Tamil Nadu (706) · Telangana (667) · Haryana (572) · Gujarat (284)
- Status: Active Center (6,172) · Upcoming (103) · Non Operational (30)
- Employee range: 201 - 500 (1,465) · <50 (1,053) · 101 - 200 (1,047) · 1K - 5K (971) · 501 - 1K (823) · 51 - 100 (772)

**Functions / Tech**
- Function: IT (3,195) · Others (2,651) · Sales & Marketing (1,736) · HR (1,562) · ER&D (1,496) · FnA (1,238)
- Software: Microsoft Azure (1,108) · AWS Cloud (900) · SAP ERP (612) · SAP MM (532) · Microsoft Power BI (473) · Jira (442)

**Prospects**
- Department: IT (27,845) · HR (7,346) · FnA (7,055) · Sales (4,250) · Marketing (4,223) · Senior Management (3,209)
- Head type: IT Head (25,575) · Others (13,663) · HR Head (6,947) · Finance Head (6,559) · GCC Head (4,822) · Procurement Head (2,781)
- Level: Director (22,962) · VP (10,983) · Head (10,106) · Manager (5,704) · Senior Manager (4,418) · Junior (3,847)
- City: Bengaluru (17,091) · TBA (11,256) · Mumbai (7,981) · Pune (6,463) · Hyderabad (5,346) · Gurugram (4,936)

## Single-filter scenarios (12)

All use default filters with the revenue slider wide open; only the listed filter changes.
A/C/P = accounts/centers/prospects counts (engine == sql).

| # | Scenario | A | C | P | match |
|--:|---|--:|--:|--:|:-:|
| 1 | defaults (visibility gcc, wide revenue) | 2,431 | 5,888 | 61,830 | ✅ |
| 2 | visibility = all | 2,675 | 6,305 | 63,838 | ✅ |
| 3 | visibility = nonGcc | 244 | 417 | 2,008 | ✅ |
| 4 | account_hq_country ⊇ United States | 1,476 | 3,125 | 35,855 | ✅ |
| 5 | account_hq_industry ⊇ Corporate Services | 439 | 1,007 | 11,723 | ✅ |
| 6 | country=US + center_city ⊇ Bengaluru | 752 | 871 | 24,534 | ✅ |
| 7 | all + center_status ⊇ Active Center | 2,655 | 6,172 | 63,818 | ✅ |
| 8 | all + function_name ⊇ IT | 1,942 | 3,195 | 56,805 | ✅ |
| 9 | all + prospect_department ⊇ IT | 1,750 | 4,908 | 27,845 | ✅ |
| 10 | country=US + prospect_level ⊇ Director | 1,217 | 2,762 | 15,592 | ✅ |
| 11 | all + account_hq_industry ∌ Corporate Services | 2,217 | 5,271 | 52,033 | ✅ |
| 12 | all + prospect_title ~ head | 1,764 | 5,010 | 12,490 | ✅ |

## Combined cross-attribute scenarios (60, seeded)

Each mixes one account + one center + one prospect filter (plus, at random, a function
or software keyword), across all three visibility modes and include/exclude modes.
Legend: ⊇ = includes, ∌ = excludes, ~ = keyword substring.

| # | Vis | Filters | A | C | P | match |
|--:|---|---|--:|--:|--:|:-:|
| 0 | all | accountPrimaryCategory⊇[Industrial,Hi-Tech] & centerFocus∌[Local Support Services] & prospectCity⊇[Bengaluru] | 561 | 1,193 | 6,047 | ✅ |
| 1 | all | accountHqIndustry⊇[Industrial Manufacturing,Financial Services] & centerFocus⊇[Global Support Services,Local Support Services] & prospectTitle⊇[director] & functionName⊇[Sales & Marketing,ER&D] | 83 | 117 | 2,238 | ✅ |
| 2 | all | accountType⊇[Global Enterprise] & centerStatus⊇[Non Operational,Active Center] & prospectHeadType⊇[Procurement Head] & techSoftwareInUse⊇[aws] | 416 | 735 | 1,384 | ✅ |
| 3 | gcc | accountType⊇[Global Enterprise] & centerCity⊇[Bengaluru] & prospectDepartment⊇[Sales,FnA] | 765 | 992 | 7,074 | ✅ |
| 4 | all | accountPrimaryCategory⊇[BFSI,Pharma & Life Sciences] & centerType⊇[CoE] & prospectLevel∌[Manager] | 50 | 76 | 3,157 | ✅ |
| 5 | all | accountNasscomStatus⊇[No,Yes] & centerCity⊇[Gurugram,Hyderabad] & prospectTitle⊇[managing] | 339 | 465 | 749 | ✅ |
| 6 | all | accountHqIndustry⊇[Industry-Specific Software] & centerEmployeesRange⊇[1K - 5K] & prospectTitle⊇[director] | 23 | 31 | 600 | ✅ |
| 7 | all | accountType⊇[Global Enterprise] & centerType⊇[GBS] & prospectCity⊇[Mumbai] & functionName⊇[HR] | 181 | 305 | 2,584 | ✅ |
| 8 | all | accountHqRegion⊇[APAC] & centerEmployeesRange⊇[1K - 5K,<50] & prospectDepartment∌[Marketing,IT] | 119 | 189 | 1,747 | ✅ |
| 9 | gcc | accountType∌[Global Enterprise] & centerStatus⊇[Upcoming] & prospectTitle⊇[director] & functionName⊇[FnA] & techSoftwareInUse⊇[sap] | 0 | 0 | 0 | ✅ |
| 10 | nonGcc | accountHqRegion∌[APAC] & centerFocus∌[Local Support Services] & prospectTitle⊇[director] | 109 | 153 | 241 | ✅ |
| 11 | all | accountHqEmployeeRange∌[10K - 25K,5K - 10K] & centerType∌[R&D,IT] & prospectDepartment⊇[Marketing,Senior Management] & functionName⊇[Others,FnA] | 633 | 1,662 | 4,721 | ✅ |
| 12 | gcc | accountHqRegion∌[APAC] & centerType⊇[IT,Manufacturing] & prospectTitle⊇[associate] & functionName⊇[Others] | 110 | 307 | 943 | ✅ |
| 13 | gcc | accountType⊇[Global Enterprise] & centerEmployeesRange⊇[201 - 500,501 - 1K] & prospectDepartment⊇[FnA,Sales] | 923 | 1,800 | 6,708 | ✅ |
| 14 | all | accountHqIndustry⊇[Industry-Specific Software] & centerType⊇[GCC/GIC] & prospectLevel⊇[VP] | 6 | 8 | 14 | ✅ |
| 15 | all | accountNasscomStatus⊇[No] & centerEmployeesRange⊇[501 - 1K] & prospectTitle⊇[director] & functionName⊇[IT] | 72 | 85 | 1,329 | ✅ |
| 16 | all | accountPrimaryCategory⊇[Industrial,Hi-Tech] & centerFocus⊇[Both] & prospectLevel⊇[Head] | 418 | 944 | 2,050 | ✅ |
| 17 | all | accountHqRegion⊇[North America] & centerStatus⊇[Upcoming] & prospectTitle⊇[director] | 33 | 39 | 976 | ✅ |
| 18 | nonGcc | accountHqCountry∌[United Kingdom] & centerEmployeesRange⊇[201 - 500,51 - 100] & prospectHeadType⊇[IT Head] & techSoftwareInUse⊇[sap] | 24 | 30 | 64 | ✅ |
| 19 | all | accountHqIndustry⊇[Industrial Manufacturing] & centerType⊇[CoE,IT] & prospectTitle⊇[associate] | 10 | 15 | 90 | ✅ |
| 20 | gcc | accountNasscomStatus⊇[No] & centerType⊇[R&D,CoE] & prospectDepartment∌[Sales] | 272 | 349 | 5,400 | ✅ |
| 21 | all | accountNasscomStatus∌[No,Yes] & centerCity⊇[Hyderabad] & prospectCity⊇[TBA,Bengaluru] | 0 | 0 | 0 | ✅ |
| 22 | nonGcc | accountHqEmployeeRange⊇[25K - 50K] & centerCity⊇[Chennai] & prospectTitle⊇[director] | 2 | 2 | 3 | ✅ |
| 23 | all | accountHqEmployeeRange⊇[1K - 5K,>50K] & centerEmployeesRange⊇[<50,1K - 5K] & prospectTitle⊇[director] | 387 | 826 | 10,470 | ✅ |
| 24 | gcc | accountHqCountry⊇[Japan,Germany] & centerState⊇[Karnataka,Gujarat] & prospectTitle⊇[managing] & functionName⊇[Sales & Marketing] & techSoftwareInUse⊇[microsoft] | 9 | 13 | 16 | ✅ |
| 25 | all | accountHqIndustry∌[Consumer Product] & centerCity∌[Hyderabad,Pune] & prospectDepartment⊇[Marketing,Senior Management] | 1,500 | 3,561 | 6,579 | ✅ |
| 26 | nonGcc | accountNasscomStatus∌[No,Yes] & centerState⊇[Haryana] & prospectTitle⊇[director] | 0 | 0 | 0 | ✅ |
| 27 | all | accountNasscomStatus∌[Yes] & centerState∌[Gujarat,Tamil Nadu] & prospectCity⊇[TBA] & techSoftwareInUse⊇[jira] | 57 | 65 | 921 | ✅ |
| 28 | gcc | accountHqIndustry⊇[Consumer Product] & centerCity∌[Gurugram] & prospectHeadType⊇[Procurement Head] | 47 | 149 | 193 | ✅ |
| 29 | all | accountType⊇[Global Enterprise] & centerState∌[Karnataka] & prospectCity⊇[Pune] & techSoftwareInUse⊇[jira] | 140 | 170 | 1,661 | ✅ |
| 30 | all | accountNasscomStatus⊇[Yes,No] & centerEmployeesRange⊇[51 - 100,201 - 500] & prospectCity⊇[TBA] | 878 | 1,534 | 5,470 | ✅ |
| 31 | gcc | accountHqCountry⊇[Japan,Switzerland] & centerStatus⊇[Active Center] & prospectLevel⊇[VP] | 64 | 256 | 533 | ✅ |
| 32 | all | accountHqEmployeeRange⊇[10K - 25K,>50K] & centerState⊇[Maharashtra,Haryana] & prospectLevel⊇[Head] & functionName⊇[FnA] & techSoftwareInUse⊇[sap] | 112 | 147 | 1,761 | ✅ |
| 33 | nonGcc | accountHqCountry⊇[France] & centerEmployeesRange⊇[501 - 1K] & prospectDepartment⊇[IT] | 1 | 1 | 49 | ✅ |
| 34 | all | accountType⊇[Global Enterprise] & centerCity⊇[Hyderabad,Gurugram] & prospectDepartment⊇[HR,FnA] & functionName⊇[IT] | 557 | 659 | 6,366 | ✅ |
| 35 | nonGcc | accountHqIndustry⊇[Industrial Manufacturing,Financial Services] & centerEmployeesRange⊇[1K - 5K] & prospectTitle⊇[director] & techSoftwareInUse⊇[sap] | 1 | 1 | 9 | ✅ |
| 36 | all | accountHqRegion⊇[MEA] & centerCity⊇[Hyderabad] & prospectCity∌[Mumbai] | 6 | 6 | 72 | ✅ |
| 37 | gcc | accountHqRegion⊇[MEA,LATAM] & centerFocus⊇[Global Support Services] & prospectHeadType⊇[HR Head] & functionName⊇[HR,IT] & techSoftwareInUse⊇[microsoft] | 5 | 6 | 6 | ✅ |
| 38 | gcc | accountHqIndustry⊇[Business Software Solutions,Industry-Specific Software] & centerFocus⊇[Local Support Services,Global Support Services] & prospectTitle⊇[director] | 123 | 168 | 1,601 | ✅ |
| 39 | all | accountHqCountry∌[Japan,Germany] & centerCity⊇[Hyderabad] & prospectTitle⊇[associate] | 195 | 232 | 2,511 | ✅ |
| 40 | gcc | accountType⊇[Global Enterprise] & centerType⊇[R&D,IT] & prospectCity∌[TBA,Hyderabad] | 1,172 | 1,741 | 25,420 | ✅ |
| 41 | nonGcc | accountPrimaryCategory⊇[Professional Services] & centerCity⊇[Hyderabad,Bengaluru] & prospectHeadType⊇[IT Head] & techSoftwareInUse⊇[sap] | 0 | 0 | 0 | ✅ |
| 42 | all | accountHqCountry⊇[Japan] & centerStatus⊇[Active Center,Non Operational] & prospectHeadType⊇[Procurement Head] | 39 | 201 | 114 | ✅ |
| 43 | gcc | accountHqIndustry∌[Consumer Product,Business Software Solutions] & centerEmployeesRange⊇[<50,201 - 500] & prospectTitle⊇[director] | 998 | 1,722 | 9,486 | ✅ |
| 44 | gcc | accountType⊇[Global Enterprise] & centerCity∌[Bengaluru,Chennai] & prospectCity∌[Pune,Mumbai] | 1,631 | 3,678 | 41,220 | ✅ |
| 45 | all | accountPrimaryCategory⊇[IT Service,Pharma & Life Sciences] & centerType∌[Manufacturing,GBS] & prospectCity⊇[Hyderabad,Gurugram] & techSoftwareInUse⊇[aws] | 72 | 136 | 1,108 | ✅ |
| 46 | nonGcc | accountHqEmployeeRange⊇[5K - 10K,10K - 25K] & centerEmployeesRange⊇[<50] & prospectCity⊇[Hyderabad] | 1 | 1 | 2 | ✅ |
| 47 | nonGcc | accountType∌[Global Enterprise] & centerEmployeesRange⊇[201 - 500,51 - 100] & prospectCity⊇[Hyderabad] & functionName⊇[HR,FnA] | 0 | 0 | 0 | ✅ |
| 48 | all | accountPrimaryCategory⊇[BFSI] & centerCity⊇[Pune] & prospectTitle⊇[associate] | 22 | 28 | 507 | ✅ |
| 49 | all | accountHqIndustry⊇[Industrial Manufacturing] & centerType⊇[IT] & prospectTitle⊇[associate] | 4 | 7 | 12 | ✅ |
| 50 | nonGcc | accountHqEmployeeRange⊇[1K - 5K,10K - 25K] & centerType⊇[IT,GBS] & prospectDepartment∌[Marketing] | 2 | 2 | 10 | ✅ |
| 51 | gcc | accountHqCountry⊇[Switzerland] & centerFocus⊇[Local Support Services] & prospectTitle⊇[director] | 18 | 40 | 541 | ✅ |
| 52 | nonGcc | accountNasscomStatus⊇[No] & centerType⊇[Manufacturing,IT] & prospectTitle⊇[managing] | 63 | 97 | 67 | ✅ |
| 53 | nonGcc | accountHqEmployeeRange⊇[1K - 5K] & centerCity∌[Gurugram] & prospectHeadType⊇[HR Head] | 16 | 21 | 23 | ✅ |
| 54 | gcc | accountHqIndustry⊇[Industrial Manufacturing,Business Software Solutions] & centerStatus⊇[Active Center] & prospectTitle⊇[director] & techSoftwareInUse⊇[microsoft] | 148 | 241 | 1,434 | ✅ |
| 55 | nonGcc | accountNasscomStatus⊇[Yes] & centerStatus⊇[Active Center] & prospectTitle⊇[director] | 37 | 63 | 76 | ✅ |
| 56 | gcc | accountPrimaryCategory⊇[BFSI] & centerEmployeesRange⊇[201 - 500] & prospectTitle⊇[director] & functionName⊇[Others] | 26 | 35 | 529 | ✅ |
| 57 | gcc | accountType∌[Global Enterprise] & centerType∌[CoE,Manufacturing] & prospectTitle⊇[managing] | 0 | 0 | 0 | ✅ |
| 58 | nonGcc | accountType⊇[Global Enterprise] & centerEmployeesRange∌[201 - 500] & prospectLevel∌[Junior] & techSoftwareInUse⊇[aws] | 21 | 26 | 119 | ✅ |
| 59 | all | accountHqIndustry⊇[Business Software Solutions,Financial Services] & centerEmployeesRange∌[51 - 100] & prospectDepartment⊇[FnA,IT] | 236 | 500 | 9,358 | ✅ |

## Reproduce on another instance

The integration tests are gated on `DATABASE_URL` (they skip without it). To run them
against a different database and confirm engine == sql there too:

```bash
DATABASE_URL='<connection-string>' REPORT_OUT=/tmp/report.json \
  npx vitest run tests/integration/filtering-sql-thorough.test.ts
```

The scenarios are seeded, so the same 60 combinations are generated every run. The test
computes both the old engine and the new SQL on that instance and asserts they match.
