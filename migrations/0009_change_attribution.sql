-- Migration: 0009_change_attribution
-- Description: Add the FDIC balance-sheet and quarterly-flow fields required
-- for deterministic quarter-change attribution. All dollar values are reported
-- in thousands, matching the existing financials table.

-- Asset identity: ASSET = CHBAL + FREPO + SC + LNLSNET + TRADE + ORE
--                         + BKPREM + INTAN + OA
ALTER TABLE financials ADD COLUMN chbal INTEGER;
ALTER TABLE financials ADD COLUMN frepo INTEGER;
ALTER TABLE financials ADD COLUMN trade INTEGER;
ALTER TABLE financials ADD COLUMN ore INTEGER;
ALTER TABLE financials ADD COLUMN bkprem INTEGER;
ALTER TABLE financials ADD COLUMN intan INTEGER;
ALTER TABLE financials ADD COLUMN oa INTEGER;

-- Funding identity: ASSET = DEP + FREPP + OTHBOR + SUBND + TRADEL
--                           + ALLOTHL + EQ
ALTER TABLE financials ADD COLUMN frepp INTEGER;
ALTER TABLE financials ADD COLUMN othbor INTEGER;
ALTER TABLE financials ADD COLUMN subnd INTEGER;
ALTER TABLE financials ADD COLUMN tradel INTEGER;
ALTER TABLE financials ADD COLUMN allothl INTEGER;

-- FDIC reported single-quarter income fields. Existing NETINC/NIM/NONII/NONIX
-- and ELNATR columns are year-to-date; these fields avoid deriving a quarter
-- when the FDIC already publishes it directly.
ALTER TABLE financials ADD COLUMN netincq INTEGER;
ALTER TABLE financials ADD COLUMN nimq INTEGER;
ALTER TABLE financials ADD COLUMN noniiq INTEGER;
ALTER TABLE financials ADD COLUMN nonixq INTEGER;
ALTER TABLE financials ADD COLUMN elnatq INTEGER;
ALTER TABLE financials ADD COLUMN iglsecq INTEGER;
ALTER TABLE financials ADD COLUMN itaxq INTEGER;
ALTER TABLE financials ADD COLUMN extraq INTEGER;
