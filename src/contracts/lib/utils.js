import {
  intersection,
  concat,
  without,
  isNil,
  slice,
  includes,
  is,
  complement,
  clone,
} from "ramda"
import { validator } from "@exodus/schemasafe"
import jsonLogic from "json-logic-js"

export const mergeData = (_data, new_data, overwrite = false) => {
  if (isNil(_data.__data) || overwrite) _data.__data = {}
  for (let k in new_data) {
    const d = new_data[k]

    if (is(Object)(d) && d.__op === "arrayUnion") {
      if (complement(is)(Array, d.arr)) err()
      if (complement(is)(Array, _data.__data[k])) _data.__data[k] = []
      _data.__data[k] = concat(_data.__data[k], d.arr)
    } else if (is(Object)(d) && d.__op === "arrayRemove") {
      if (complement(is)(Array, d.arr)) err()
      if (complement(is)(Array, _data.__data[k])) _data.__data[k] = []
      _data.__data[k] = without(d.arr, _data.__data[k])
    } else if (is(Object)(d) && d.__op === "inc") {
      if (isNaN(d.n)) err()
      if (isNil(_data.__data[k])) _data.__data[k] = 0
      _data.__data[k] += d.n
    } else if (is(Object)(d) && d.__op === "del") {
      delete _data.__data[k]
    } else if (is(Object)(d) && d.__op === "ts") {
      _data.__data[k] = SmartWeave.block.timestamp
    } else {
      _data.__data[k] = d
    }
  }
  return _data
}

export const getDoc = (data, path, _signer, func, new_data) => {
  const [_col, id] = path
  data[_col] ||= { __docs: {} }
  const col = data[_col]
  const { rules, schema } = col
  col.__docs[id] ||= { __data: null, subs: {} }
  const doc = col.__docs[id]
  if (!isNil(_signer) && isNil(doc.setter)) doc.setter = _signer
  if (
    includes(func)(["set", "add", "update", "upsert", "delete"]) &&
    !isNil(rules)
  ) {
    let op = func
    if (includes(op)("set", "add")) op = "create"
    if (op === "create" && !isNil(doc.__data)) op = "update"
    if (op === "upsert") {
      if (!isNil(doc.__data)) {
        op = "update"
      } else {
        op = "create"
      }
    }
    let allowed = false
    let newData = null
    if (path.length === 2) {
      if (includes(func)(["set", "add"])) {
        newData = mergeData(clone(doc), new_data, true).__data
      } else if (includes(func)(["update", "upsert"])) {
        newData = mergeData(clone(doc), new_data).__data
      }
    }
    for (let k in rules) {
      const rule = rules[k]
      const [permission, _ops] = k.split(" ")
      const ops = _ops.split(",")
      if (intersection(ops)(["write", op]).length > 0) {
        const rule_data = {
          request: {
            auth: { signer: _signer },
            block: {
              height: SmartWeave.block.height,
              timestamp: SmartWeave.block.timestamp,
            },
            transaction: {
              id: SmartWeave.transaction.id,
            },
            resource: { data: new_data },
          },
          resource: { data: doc.__data, setter: doc.setter, newData },
        }
        const ok = jsonLogic.apply(rule, rule_data)
        if (permission === "allow" && ok) {
          allowed = true
        } else if (permission === "deny" && ok) err()
      }
    }
    if (!allowed) err()
  }

  return path.length >= 4
    ? getDoc(doc.subs, slice(2, path.length, path), _signer, func)
    : {
        doc,
        schema,
        rules,
      }
}

export const getCol = (data, path, _signer) => {
  const [col, id] = path
  data[col] ||= { __docs: {} }
  if (isNil(id)) {
    return data[col]
  } else {
    data[col].__docs[id] ||= { __data: null, subs: {} }
    if (!isNil(_signer) && isNil(data[col].__docs[id].setter)) {
      data[col].__docs[id].setter = _signer
    }
    return getCol(
      data[col].__docs[id].subs,
      slice(2, path.length, path),
      _signer
    )
  }
}

function bigIntFromBytes(byteArr) {
  let hexString = ""
  for (const byte of byteArr) {
    hexString += byte.toString(16).padStart(2, "0")
  }
  return BigInt("0x" + hexString)
}

async function getRandomIntNumber(max, action, uniqueValue = "") {
  const pseudoRandomData = SmartWeave.arweave.utils.stringToBuffer(
    SmartWeave.block.height +
      SmartWeave.block.timestamp +
      SmartWeave.transaction.id +
      action.caller +
      uniqueValue
  )
  const hashBytes = await SmartWeave.arweave.crypto.hash(pseudoRandomData)
  const randomBigInt = bigIntFromBytes(hashBytes)
  return Number(randomBigInt % BigInt(max))
}

const genId = async action => {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let autoId = ""
  for (let i = 0; i < 20; i++) {
    autoId += CHARS.charAt(
      (await getRandomIntNumber(CHARS.length, action, i)) - 1
    )
  }
  return autoId
}

export const parse = async (state, action, func, signer) => {
  const { data } = state
  const { query } = action.input
  let new_data = null
  let path = null
  if (includes(func)(["delete", "getSchema", "getRules"])) {
    path = query
  } else {
    ;[new_data, ...path] = query
    if (func === "add") {
      const id = await genId(action)
      if (isNil(state.ids[SmartWeave.transaction.id])) {
        state.ids[SmartWeave.transaction.id] = []
      }
      state.ids[SmartWeave.transaction.id].push(id)
      path.push(id)
    }
  }
  if (
    (isNil(new_data) && !includes(func)(["delete", "getSchema", "getRules"])) ||
    path.length === 0 ||
    (path.length % 2 !== 0 &&
      !includes(func)(["setSchema", "getSchema", "setRules", "getRules"]))
  ) {
    err()
  }
  let _data = null
  let schema = null
  let rules = null
  if (includes(func)(["setSchema", "getSchema", "setRules", "getRules"])) {
    _data = getCol(data, path, signer, func)
  } else {
    const doc = getDoc(data, path, signer, func, new_data)
    _data = doc.doc
    schema = doc.schema
    rules = doc.rules
  }
  if (
    includes(func)(["update", "upsert", "delete"]) &&
    _data.setter !== signer
  ) {
  } else if (
    includes(func)(["setSchema", "setRules"]) &&
    action.caller !== state.owner
  ) {
    err("caller is not contract owner")
  }
  if (includes(func)(["set", "add", "update", "upsert"]) && !isNil(schema)) {
    const _validate = validator(schema)
    if (!_validate(new_data)) err()
  }
  return { data, query, new_data, path, _data, schema }
}

export const err = (msg = `The wrong query`) => {
  throw new ContractError(msg)
}
