const { Wallet } = require("ethers")
const Arweave = require("arweave")
const fs = require("fs")
const path = require("path")
const { expect } = require("chai")
const { isNil, range } = require("ramda")
const ethSigUtil = require("@metamask/eth-sig-util")
const { init, stop, initBeforeEach, addFunds } = require("./util")

describe("WeaveDB", function () {
  let wallet, walletAddress, wallet2, sdk

  this.timeout(0)

  before(async () => {
    sdk = await init()
  })

  after(async () => await stop())

  beforeEach(async () => {
    ;({ walletAddress, wallet, wallet2 } = await initBeforeEach())
  })

  it("should get nonce", async () => {
    expect(await sdk.getNonce(wallet.getAddressString())).to.equal(1)
    await sdk.set({ id: 1 }, "col", "doc")
    expect(await sdk.getNonce(wallet.getAddressString())).to.equal(2)
  })

  it("should add & get", async () => {
    const data = { name: "Bob", age: 20 }
    const tx = await sdk.add(data, "ppl")
    expect(await sdk.get("ppl", (await sdk.getIds(tx))[0])).to.eql(data)
  })

  it("should set & get", async () => {
    const data = { name: "Bob", age: 20 }
    const data2 = { name: "Alice", height: 160 }
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
    await sdk.set(data2, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data2)
  })

  it("should cget & pagenate", async () => {
    const data = { name: "Bob", age: 20 }
    const data2 = { name: "Alice", age: 160 }
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
    await sdk.set(data2, "ppl", "Alice")
    const cursor = (await sdk.cget("ppl", ["age"], 1))[0]
    expect(await sdk.get("ppl", ["age"], ["startAfter", cursor])).to.eql([
      data2,
    ])
  })

  it("should update", async () => {
    const data = { name: "Bob", age: 20 }
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
    await sdk.update({ age: 25 }, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql({ name: "Bob", age: 25 })
    await sdk.update({ age: sdk.inc(5) }, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql({ name: "Bob", age: 30 })
    await sdk.update({ age: sdk.del(5) }, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql({ name: "Bob" })

    // arrayUnion
    await sdk.update(
      { foods: sdk.union("pasta", "cake", "wine") },
      "ppl",
      "Bob"
    )
    expect(await sdk.get("ppl", "Bob")).to.eql({
      name: "Bob",
      foods: ["pasta", "cake", "wine"],
    })

    // arrayRemove
    await sdk.update({ foods: sdk.remove("pasta", "cake") }, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql({
      name: "Bob",
      foods: ["wine"],
    })

    // timestamp
    const tx = await sdk.update({ death: sdk.ts() }, "ppl", "Bob")
    const tx_data = await sdk.arweave.transactions.get(tx)
    const timestamp = (await sdk.arweave.blocks.get(tx_data.block)).timestamp
    expect((await sdk.get("ppl", "Bob")).death).to.be.lte(timestamp)
  })

  it("should upsert", async () => {
    const data = { name: "Bob", age: 20 }
    await sdk.upsert(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
  })

  it("should delete", async () => {
    const data = { name: "Bob", age: 20 }
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
    await sdk.delete("ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(null)
  })

  it("should get a collection", async () => {
    const Bob = {
      name: "Bob",
      age: 20,
      height: 170,
      weight: 75,
      letters: ["b", "o"],
    }
    const Alice = {
      name: "Alice",
      age: 30,
      height: 160,
      weight: 60,
      letters: ["a", "l", "i", "c", "e"],
    }
    const John = {
      name: "John",
      age: 40,
      height: 180,
      weight: 100,
      letters: ["j", "o", "h", "n"],
    }
    const Beth = {
      name: "Beth",
      age: 30,
      height: 165,
      weight: 70,
      letters: ["b", "e", "t", "h"],
    }
    await sdk.set(Bob, "ppl", "Bob")
    await sdk.set(Alice, "ppl", "Alice")
    await sdk.set(John, "ppl", "John")
    await sdk.set(Beth, "ppl", "Beth")
    expect(await sdk.get("ppl")).to.eql([Bob, Alice, John, Beth])

    // limit
    expect((await sdk.get("ppl", 1)).length).to.eql(1)

    // sort
    expect(await sdk.get("ppl", ["height"])).to.eql([Alice, Beth, Bob, John])

    // sort desc
    expect(await sdk.get("ppl", ["height", "desc"])).to.eql([
      John,
      Bob,
      Beth,
      Alice,
    ])

    // sort multiple fields
    await sdk.addIndex([["age"], ["weight", "desc"]], "ppl")
    expect(await sdk.get("ppl", ["age"], ["weight", "desc"])).to.eql([
      Bob,
      Beth,
      Alice,
      John,
    ])

    // where =
    expect(await sdk.get("ppl", ["age", "=", 30])).to.eql([Alice, Beth])

    // where >
    expect(await sdk.get("ppl", ["age"], ["age", ">", 30])).to.eql([John])

    // where >=
    expect(await sdk.get("ppl", ["age"], ["age", ">=", 30])).to.eql([
      Beth,
      Alice,
      John,
    ])

    // where <
    expect(await sdk.get("ppl", ["age"], ["age", "<", 30])).to.eql([Bob])

    // where <=
    expect(await sdk.get("ppl", ["age"], ["age", "<=", 30])).to.eql([
      Bob,
      Beth,
      Alice,
    ])

    // where =!
    expect(await sdk.get("ppl", ["age"], ["age", "!=", 30])).to.eql([Bob, John])

    // where in
    expect(await sdk.get("ppl", ["age", "in", [20, 30]])).to.eql([
      Bob,
      Alice,
      Beth,
    ])

    // where not-in
    expect(await sdk.get("ppl", ["age"], ["age", "not-in", [20, 30]])).to.eql([
      John,
    ])

    // where array-contains
    expect(await sdk.get("ppl", ["letters", "array-contains", "b"])).to.eql([
      Bob,
      Beth,
    ])

    // where array-contains-any
    expect(
      await sdk.get("ppl", ["letters", "array-contains-any", ["j", "t"]])
    ).to.eql([John, Beth])

    // skip startAt
    expect(await sdk.get("ppl", ["age"], ["startAt", 30])).to.eql([
      Beth,
      Alice,
      John,
    ])

    // skip startAfter
    expect(await sdk.get("ppl", ["age"], ["startAfter", 30])).to.eql([John])

    // skip endAt
    expect(await sdk.get("ppl", ["age"], ["endAt", 30])).to.eql([
      Bob,
      Beth,
      Alice,
    ])

    // skip endBefore
    expect(await sdk.get("ppl", ["age"], ["endBefore", 30])).to.eql([Bob])

    // skip startAt multiple fields
    await sdk.addIndex([["age"], ["weight"]], "ppl")
    expect(
      await sdk.get("ppl", ["age"], ["weight"], ["startAt", 30, 70])
    ).to.eql([Beth, John])

    // skip endAt multiple fields
    expect(
      await sdk.get("ppl", ["age"], ["weight"], ["endAt", 30, 60])
    ).to.eql([Bob, Alice])
  })

  it("should batch execute", async () => {
    const data = { name: "Bob", age: 20 }
    const data2 = { name: "Alice", age: 40 }
    const data3 = { name: "Beth", age: 10 }
    const tx = await sdk.batch([
      ["set", data, "ppl", "Bob"],
      ["set", data3, "ppl", "Beth"],
      ["update", { age: 30 }, "ppl", "Bob"],
      ["upsert", { age: 20 }, "ppl", "Bob"],
      ["add", data2, "ppl"],
      ["delete", "ppl", "Beth"],
    ])
    expect(await sdk.get("ppl", "Bob")).to.eql({ name: "Bob", age: 20 })
    expect(await sdk.get("ppl", (await sdk.getIds(tx))[0])).to.eql(data2)
    expect(await sdk.get("ppl", "Beth")).to.eql(null)
  })

  it("should set schema", async () => {
    const data = { name: "Bob", age: 20 }
    const schema = {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "number",
        },
      },
    }
    const schema2 = {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
        },
      },
    }
    await sdk.setSchema(schema, "ppl")
    expect(await sdk.getSchema("ppl")).to.eql(schema)
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(null)
    await sdk.setSchema(schema2, "ppl")
    expect(await sdk.getSchema("ppl")).to.eql(schema2)
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
  })

  it("should set rules", async () => {
    const data = { name: "Bob", age: 20 }
    const rules = {
      "allow create,update": {
        and: [
          { "!=": [{ var: "request.auth.signer" }, null] },
          { "<": [{ var: "resource.newData.age" }, 30] },
        ],
      },
      "deny delete": { "!=": [{ var: "request.auth.signer" }, null] },
    }
    await sdk.setRules(rules, "ppl")
    expect(await sdk.getRules("ppl")).to.eql(rules)
    await sdk.set(data, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
    await sdk.delete("ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql(data)
    await sdk.update({ age: sdk.inc(10) }, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql({ name: "Bob", age: 20 })
    await sdk.update({ age: sdk.inc(5) }, "ppl", "Bob")
    expect(await sdk.get("ppl", "Bob")).to.eql({ name: "Bob", age: 25 })
  })

  it("should add index", async () => {
    const data = { name: "Bob", age: 20 }
    const data2 = { name: "Alice", age: 25 }
    const data3 = { name: "Beth", age: 5 }
    const data4 = { name: "John", age: 20, height: 150 }
    await sdk.add(data, "ppl")
    expect(await sdk.get("ppl", ["age"])).to.eql([data])
    await sdk.set(data2, "ppl", "Alice")
    expect(await sdk.get("ppl", ["age", "desc"])).to.eql([data2, data])
    await sdk.upsert(data3, "ppl", "Beth")
    expect(await sdk.get("ppl", ["age", "desc"])).to.eql([data2, data, data3])
    await sdk.update({ age: 30 }, "ppl", "Beth")
    expect(await sdk.get("ppl", ["age", "desc"])).to.eql([
      { name: "Beth", age: 30 },
      data2,
      data,
    ])
    await sdk.addIndex([["age"], ["name", "desc"]], "ppl")
    await sdk.addIndex([["age"], ["name", "desc"], ["height"]], "ppl")
    await sdk.addIndex([["age"], ["name", "desc"], ["height", "desc"]], "ppl")

    await sdk.upsert(data4, "ppl", "John")
    expect(await sdk.get("ppl", ["age"], ["name", "desc"])).to.eql([
      data4,
      data,
      data2,
      { name: "Beth", age: 30 },
    ])
    expect(
      await sdk.get("ppl", ["age"], ["name", "in", ["Alice", "John"]])
    ).to.eql([data4, data2])
    expect(await sdk.getIndexes("ppl")).to.eql([
      [["name", "asc"]],
      [["age", "asc"]],
      [
        ["age", "asc"],
        ["name", "desc"],
      ],
      [
        ["age", "asc"],
        ["name", "desc"],
        ["height", "asc"],
      ],
      [
        ["age", "asc"],
        ["name", "desc"],
        ["height", "desc"],
      ],
      [["height", "asc"]],
    ])
  })

  it("should link temporarily generated address", async () => {
    const addr = wallet.getAddressString()
    const { identity } = await sdk.createTempAddress(addr)
    delete sdk.wallet
    await sdk.set({ name: "Beth", age: 10 }, "ppl", "Beth", {
      wallet: addr,
      addr: identity.address,
      privateKey: identity.privateKey,
    })
    expect((await sdk.cget("ppl", "Beth")).setter).to.eql(addr)
    return
    await sdk.removeAddressLink({
      address: identity.address,
    })
    await sdk.set({ name: "Bob", age: 20 }, "ppl", "Bob", {
      addr: identity.address,
      privateKey: identity.privateKey,
      overwrite: true,
    })
    expect((await sdk.cget("ppl", "Bob")).setter).to.eql(
      identity.address.toLowerCase()
    )
  })
})
