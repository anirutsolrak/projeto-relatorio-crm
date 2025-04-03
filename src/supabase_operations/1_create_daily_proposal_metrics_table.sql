-- Create the main metrics table with proper constraints and indexes
CREATE TABLE IF NOT EXISTS daily_proposal_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metric_date DATE NOT NULL,
  metric_month DATE NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  value NUMERIC NOT NULL,
  source_file_type TEXT NOT NULL CHECK (source_file_type IN ('monthly', 'annual')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id),
  CONSTRAINT unique_metric_entry UNIQUE (metric_date, category, sub_category)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_proposal_metrics_date ON daily_proposal_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_proposal_metrics_month ON daily_proposal_metrics(metric_month);
CREATE INDEX IF NOT EXISTS idx_daily_proposal_metrics_category ON daily_proposal_metrics(category);
CREATE INDEX IF NOT EXISTS idx_daily_proposal_metrics_sub_category ON daily_proposal_metrics(sub_category);

-- Create view for the latest day's data
CREATE OR REPLACE VIEW view_metrics_latest_day AS
SELECT * FROM daily_proposal_metrics
WHERE metric_date = (SELECT MAX(metric_date) FROM daily_proposal_metrics);

-- Create function to get metrics for a period
CREATE OR REPLACE FUNCTION function_get_metrics_period(
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  date DATE,
  digitadas NUMERIC,
  nao_digitadas NUMERIC,
  integradas NUMERIC,
  contas_ativas NUMERIC,
  limite_medio NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_totals AS (
    SELECT 
      metric_date AS date,
      SUM(CASE WHEN category = 'DIGITADAS' AND sub_category = 'TOTAL' THEN value ELSE 0 END) AS digitadas,
      SUM(CASE WHEN category = 'NÃO DIGITADAS' AND sub_category = 'TOTAL' THEN value ELSE 0 END) AS nao_digitadas,
      SUM(CASE WHEN category = 'PROPOSTAS INTEGRADAS' AND sub_category = 'TOTAL' THEN value ELSE 0 END) AS integradas,
      SUM(CASE WHEN category = 'CONTAS ATIVAS' AND sub_category = 'TOTAL' THEN value ELSE 0 END) AS contas_ativas,
      SUM(CASE WHEN category = 'FAIXA_LIMITE' AND sub_category = 'MEDIA' THEN value ELSE 0 END) AS limite_medio
    FROM daily_proposal_metrics
    WHERE metric_date BETWEEN start_date AND end_date
    GROUP BY metric_date
  )
  SELECT * FROM daily_totals
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

-- Create function to get category breakdown
CREATE OR REPLACE FUNCTION function_get_category_breakdown(
  start_date DATE,
  end_date DATE,
  category_param TEXT
)
RETURNS TABLE (
  sub_category TEXT,
  total NUMERIC,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH category_data AS (
    SELECT 
      sub_category,
      SUM(value) AS total
    FROM daily_proposal_metrics
    WHERE metric_date BETWEEN start_date AND end_date
      AND category = category_param
    GROUP BY sub_category
  ),
  total_sum AS (
    SELECT SUM(total) AS sum_total FROM category_data
  )
  SELECT 
    cd.sub_category,
    cd.total,
    ROUND((cd.total * 100.0 / NULLIF(ts.sum_total, 0))::NUMERIC, 2) AS percentage
  FROM category_data cd
  CROSS JOIN total_sum ts
  ORDER BY cd.total DESC;
END;
$$ LANGUAGE plpgsql;
