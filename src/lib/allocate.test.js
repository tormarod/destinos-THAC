const { allocate } = require("./allocate");

function byUser(a, id) {
  return a.find((x) => x.userId === id);
}

describe("allocate()", () => {
  test("basic two users: earlier order gets first choice; second gets next", () => {
    const submissions = [
      {
        id: "u1",
        name: "User 1",
        order: 1,
        rankedItems: ["A", "B"],
        submittedAt: 1000,
      },
      {
        id: "u2",
        name: "User 2",
        order: 2,
        rankedItems: ["A", "B"],
        submittedAt: 1001,
      },
    ];

    const out = allocate(submissions);

    // assignments
    expect(byUser(out, "u1").assignedItemIds).toEqual(["A"]);
    expect(byUser(out, "u2").assignedItemIds).toEqual(["B"]);

    // available-by-preference: shows next 20 backup allocations
    expect(byUser(out, "u1").availableByPreference).toEqual(["B"]); // if A unavailable, would get B
    expect(byUser(out, "u2").availableByPreference).toEqual([]); // if A unavailable, would get nothing
  });

  test("round-robin honors quota = order; stops when no more choices", () => {
    const submissions = [
      {
        id: "u1",
        name: "U1",
        order: 2,
        rankedItems: [1, 2, 3],
        submittedAt: 1,
      },
      {
        id: "u2",
        name: "U2",
        order: 1,
        rankedItems: [1, 3, 2],
        submittedAt: 2,
      },
      {
        id: "u3",
        name: "U3",
        order: 3,
        rankedItems: [2, 3, 1],
        submittedAt: 3,
      },
    ];

    const out = allocate(submissions);

    // Priority by order ASC: u2 (1), u1 (2), u3 (3)
    // Round 1: u2->1, u1->2, u3->3
    // Round 2: quotas remain but nothing left that matches
    expect(byUser(out, "u2").assignedItemIds).toEqual(["1"]);
    expect(byUser(out, "u1").assignedItemIds).toEqual(["2"]);
    expect(byUser(out, "u3").assignedItemIds).toEqual(["3"]);
  });

  test("tie on order breaks by submittedAt (earlier wins)", () => {
    const submissions = [
      // same order, different submittedAt
      {
        id: "early",
        name: "Early",
        order: 1,
        rankedItems: ["X", "Y"],
        submittedAt: 10,
      },
      {
        id: "late",
        name: "Late",
        order: 1,
        rankedItems: ["X", "Y"],
        submittedAt: 20,
      },
    ];

    const out = allocate(submissions);

    expect(byUser(out, "early").assignedItemIds).toEqual(["X"]);
    expect(byUser(out, "late").assignedItemIds).toEqual(["Y"]);
    expect(byUser(out, "late").availableByPreference).toEqual([]); // if X unavailable, no backup available
  });

  test("handles string/number IDs consistently", () => {
    const submissions = [
      {
        id: "u1",
        name: "U1",
        order: 1,
        rankedItems: [101, "102"],
        submittedAt: 1,
      },
      {
        id: "u2",
        name: "U2",
        order: 2,
        rankedItems: ["101", 102],
        submittedAt: 2,
      },
    ];

    const out = allocate(submissions);

    // u1 takes "101" first; u2 then gets "102"
    expect(byUser(out, "u1").assignedItemIds).toEqual(["101"]);
    expect(byUser(out, "u2").assignedItemIds).toEqual(["102"]);
  });

  test("zero/negative order still gets 1 item if available", () => {
    const submissions = [
      {
        id: "u1",
        name: "U1",
        order: 0,
        rankedItems: ["A", "B"],
        submittedAt: 1,
      },
      {
        id: "u2",
        name: "U2",
        order: -3,
        rankedItems: ["A", "B"],
        submittedAt: 2,
      },
      {
        id: "u3",
        name: "U3",
        order: 1,
        rankedItems: ["A", "B"],
        submittedAt: 3,
      },
    ];

    const out = allocate(submissions);

    // All users get exactly 1 item in priority order (by order number, then submittedAt)
    // Priority: u2 (order -3), u1 (order 0), u3 (order 1)
    expect(byUser(out, "u1").assignedItemIds).toEqual(["B"]);
    expect(byUser(out, "u2").assignedItemIds).toEqual(["A"]);
    expect(byUser(out, "u3").assignedItemIds).toEqual([]);
  });

  test("availableByPreference shows backup allocations with X=0 (default)", () => {
    const submissions = [
      {
        id: "u1",
        name: "U1",
        order: 1,
        rankedItems: ["A", "B", "C"],
        submittedAt: 1,
      },
      {
        id: "u2",
        name: "U2",
        order: 2,
        rankedItems: ["B", "C", "A"],
        submittedAt: 2,
      },
      {
        id: "u3",
        name: "U3",
        order: 3,
        rankedItems: ["C", "B", "A"],
        submittedAt: 3,
      },
    ];

    const out = allocate(submissions);

    // Assignments with priority by order: u1->A, u2->B, u3->C
    // availableByPreference shows next 20 backup allocations (X=0, no preferences of users above marked unavailable):
    expect(byUser(out, "u1").availableByPreference).toEqual(["B", "C"]); // if A unavailable→B, if A,B unavailable→C
    expect(byUser(out, "u2").availableByPreference).toEqual(["C"]); // if B unavailable, would get C
    expect(byUser(out, "u3").availableByPreference).toEqual([]); // if C unavailable, would get nothing
  });

  test("availableByPreference shows backup allocations with X=1 (first preference of users above unavailable)", () => {
    const submissions = [
      {
        id: "u1",
        name: "U1",
        order: 1,
        rankedItems: ["A", "B", "C"],
        submittedAt: 1,
      },
      {
        id: "u2",
        name: "U2",
        order: 2,
        rankedItems: ["B", "C", "A"],
        submittedAt: 2,
      },
      {
        id: "u3",
        name: "U3",
        order: 3,
        rankedItems: ["C", "B", "A"],
        submittedAt: 3,
      },
    ];

    const out = allocate(submissions, 1);

    // With X=1, first preference of users above each user are marked unavailable
    // u1: if A unavailable→B, if A,B unavailable→C (same as before since no users above u1)
    // u2: if B unavailable→C (u1's A is marked unavailable, so u1 gets B, leaving C for u2)
    // u3: if C unavailable→A (u1's A and u2's B are marked unavailable, so u1 gets B, u2 gets C, leaving A for u3)
    expect(byUser(out, "u1").availableByPreference).toEqual(["B", "C"]);
    expect(byUser(out, "u2").availableByPreference).toEqual(["C", "A"]);
    expect(byUser(out, "u3").availableByPreference).toEqual(["A"]);
  });

  test("gracefully handles users with empty rankedItems", () => {
    const submissions = [
      { id: "u1", name: "U1", order: 1, rankedItems: [], submittedAt: 1 },
      { id: "u2", name: "U2", order: 2, rankedItems: ["A"], submittedAt: 2 },
    ];

    const out = allocate(submissions);

    expect(byUser(out, "u1").assignedItemIds).toEqual([]);
    expect(byUser(out, "u2").assignedItemIds).toEqual(["A"]);
  });

  test("when preferences run out before quota, assignment stops (no duplicate picks)", () => {
    const submissions = [
      { id: "u1", name: "U1", order: 5, rankedItems: ["A"], submittedAt: 1 }, // wants many, only has A
      { id: "u2", name: "U2", order: 5, rankedItems: ["B"], submittedAt: 2 },
    ];

    const out = allocate(submissions);

    expect(byUser(out, "u1").assignedItemIds).toEqual(["A"]);
    expect(byUser(out, "u2").assignedItemIds).toEqual(["B"]);
  });
});
