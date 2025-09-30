-- Migration: Update exec_raw_sql to allow WITH (CTE) queries
-- This enables peer comparison endpoints to use Common Table Expressions

CREATE OR REPLACE FUNCTION exec_raw_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Security check: Allow SELECT and WITH (CTE) statements
  IF NOT (query ~* '^\s*(WITH|SELECT)') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  -- Block dangerous keywords
  IF query ~* '\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b' THEN
    RAISE EXCEPTION 'Dangerous SQL keywords detected';
  END IF;
  
  -- Execute the query and return as JSON
  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  
  -- Return empty array if no results
  RETURN COALESCE(result, '[]'::json);
END;
$$;

COMMENT ON FUNCTION exec_raw_sql IS 'Executes a SELECT or WITH query and returns results as JSON array. Used by AI assistant and peer comparison for complex analytical queries. Security: Only SELECT/WITH statements allowed, dangerous keywords blocked.';
