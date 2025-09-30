-- Migration: Create function to execute raw SQL queries for AI assistant
-- This enables the chat AI to run complex analytical queries with JOINs, aggregations, etc.

CREATE OR REPLACE FUNCTION exec_raw_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Security check: Only allow SELECT statements
  IF NOT (query ~* '^\s*SELECT') THEN
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

COMMENT ON FUNCTION exec_raw_sql IS 'Executes a SELECT query and returns results as JSON array. Used by AI assistant for complex analytical queries. Security: Only SELECT statements allowed, dangerous keywords blocked.';
