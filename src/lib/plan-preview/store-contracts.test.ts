import assert from "node:assert/strict";
import test from "node:test";

import { uniqueContractOptions } from "./store";

test("uniqueContractOptions keeps first name per contract and sorts by id", () => {
  const options = uniqueContractOptions([
    {
      contract_id: "h1607",
      contract_name: "ANTHEM INSURANCE COMPANIES, INC.",
      organization_marketing_name: "Anthem Blue Cross and Blue Shield",
      parent_organization: "Elevance Health, Inc.",
    },
    {
      contract_id: "H0907",
      contract_name: "WELLPOINT IOWA, INC.",
      organization_marketing_name: "Wellpoint",
      parent_organization: "Elevance Health, Inc.",
    },
    {
      contract_id: "H0907",
      contract_name: "WELLPOINT IOWA, INC.",
      organization_marketing_name: "Wellpoint",
      parent_organization: "Elevance Health, Inc.",
    },
  ]);

  assert.deepEqual(
    options.map((row) => row.contractId),
    ["H0907", "H1607"]
  );
  assert.equal(options[0].contractName, "WELLPOINT IOWA, INC.");
  assert.equal(options[0].parentOrganization, "Elevance Health, Inc.");
});
