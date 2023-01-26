import { Definitions, Schema } from './types/schemas'

/**
 * check whether item is plain object
 */
const isObject = function (item: unknown): boolean {
	return typeof item === 'object' && item !== null && item.toString() === {}.toString()
}

/**
 * deep JSON object clone
 */
const cloneJSON = function <T>(source: T): T {
	return JSON.parse(JSON.stringify(source))
}

/**
 * returns a result of deep merge of two objects
 */
const merge = function (target: Record<string, any>, source: Record<string, any>): Record<string, unknown> {
	target = cloneJSON(target)

	for (const key in source) {
		if (source.hasOwnProperty(key)) {
			if (isObject(target[key]) && isObject(source[key])) {
				target[key] = merge(target[key], source[key])
			} else {
				target[key] = source[key]
			}
		}
	}
	return target
}

/**
 * get object by reference. works only with local references that points on
 * definitions object
 */
const getLocalRef = function (path: string, definitions: Definitions): unknown {
	const pathArr = path.replace(/^#\/definitions\//, '').split('/')

	const find = function (path: string[], root: Definitions): unknown {
		const key = path.shift()
		if (key === undefined || !root[key]) {
			return {}
		} else if (!path.length) {
			return root[key]
		} else {
			return find(path, root[key])
		}
	}

	const result = find(pathArr, definitions)

	if (!isObject(result)) {
		return result
	}
	return cloneJSON(result)
}

/**
 * merge list of objects from allOf properties
 * if some of objects contains $ref field extracts this reference and merge it
 */
const mergeAllOf = function (allOfList: Array<Record<string, any>>, definitions: Definitions) {
	let length = allOfList.length
	let index = -1
	let result = {}

	while (++index < length) {
		let item = allOfList[index] as any

		item = typeof item.$ref !== 'undefined' ? getLocalRef(item.$ref, definitions) : item

		result = merge(result, item)
	}

	return result
}

/**
 * returns a object that built with default values from json schema
 */
const defaults = function (schema: Schema, definitions: Definitions): unknown {
	if (typeof schema['default'] !== 'undefined') {
		return schema['default']
	} else if (typeof schema.allOf !== 'undefined') {
		const mergedItem = mergeAllOf(schema.allOf, definitions)
		return defaults(mergedItem, definitions)
	} else if (typeof schema.$ref !== 'undefined') {
		const reference = getLocalRef(schema.$ref, definitions)
		return defaults(reference as Schema, definitions)
	} else if (schema.type === 'object') {
		if (!schema.properties) {
			return {}
		}

		for (const key in schema.properties) {
			if (schema.properties.hasOwnProperty(key)) {
				schema.properties[key] = defaults(schema.properties[key], definitions)

				if (typeof schema.properties[key] === 'undefined') {
					delete schema.properties[key]
				}
			}
		}

		return schema.properties
	} else if (schema.type === 'array') {
		if (!schema.items) {
			return []
		}

		// minimum item count
		const ct = schema.minItems || 0
		// tuple-typed arrays
		if (schema.items.constructor === Array) {
			const values: unknown[] = schema.items.map(function (item) {
				return defaults(item, definitions)
			})
			// remove undefined items at the end (unless required by minItems)
			for (let i = values.length - 1; i >= 0; i--) {
				if (typeof values[i] !== 'undefined') {
					break
				}
				if (i + 1 > ct) {
					values.pop()
				}
			}
			return values
		}
		// object-typed arrays
		const value = defaults(schema.items, definitions)
		if (typeof value === 'undefined') {
			return []
		} else {
			const values = []
			for (let i = 0; i < Math.max(1, ct); i++) {
				values.push(cloneJSON(value))
			}
			return values
		}
	}
}

/**
 * main function
 */
export default function (schema: Schema, definitions?: Definitions): unknown {
	if (typeof definitions === 'undefined') {
		definitions = schema.definitions ?? {}
	} else if (isObject(schema.definitions)) {
		definitions = merge(definitions, schema.definitions)
	}

	return defaults(cloneJSON(schema), definitions!)
}
