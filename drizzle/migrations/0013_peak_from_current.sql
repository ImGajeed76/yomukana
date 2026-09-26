-- Readers who already have a score start with it as their best, so their
-- next sync is judged from where they are rather than from zero.
UPDATE profiles SET peak_score = score, peak_at = scored_at WHERE peak_score < score;
