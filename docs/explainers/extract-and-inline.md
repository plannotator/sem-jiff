# Extract function and inline function

> Draft for the docs site (2026-11-06).

A semantic diff recognises two common refactorings and shows them as one
change, instead of a pile of deleted and added lines.

## Extract function

Some lines move **out** of a function into a **new** function, and the old
spot now calls it.

**Before**

```ts
export function checkout(items: Item[]) {
  let subtotal = 0;                          // ┐
  for (const item of items) {                // │ these lines…
    subtotal += item.price * item.qty;       // │
  }                                          // ┘
  return subtotal * 1.2;
}
```

**After**

```ts
export function checkout(items: Item[]) {
  const subtotal = sumLineItems(items);      // ← …are replaced by a call
  return subtotal * 1.2;
}

function sumLineItems(items: Item[]): number {   // ← new function
  let subtotal = 0;                          // ┐
  for (const item of items) {                // │ …and now live here
    subtotal += item.price * item.qty;       // │
  }                                          // ┘
  return subtotal;                           // ← added, to hand the result back
}
```

Why people do it: `checkout` gets shorter, and the loop gets a name and can
be reused.

How the diff shows it:

- **Blue:** the moved code, linked from its old place to its new place.
- **Green:** what is genuinely new: the call, the new function's first and last
  lines, and the added `return`.
- Everything else in `checkout` stays unchanged.

## Inline function

The exact opposite: a small helper is **deleted**, and its body is pasted
**into** the place that called it.

**Before**

```go
func ActiveCartTotal(items []CartItem) int {
	total := 0
	for _, item := range items {
		if item.Active {
			total += cartItemTotal(item)     // ← calls the helper
		}
	}
	return total
}

func cartItemTotal(item CartItem) int {      // ← helper
	price := item.Price
	shipping := item.Shipping
	return price + shipping
}
```

**After**

```go
func ActiveCartTotal(items []CartItem) int {
	total := 0
	for _, item := range items {
		if item.Active {
			price := item.Price               // ┐ helper's body,
			shipping := item.Shipping         // │ pasted in
			total += price + shipping         // ┘ its return value replaces the call
		}
	}
	return total
}
// cartItemTotal is gone
```

Why people do it: the helper was tiny or used once, so a separate function just
made you jump around.

How the diff shows it:

- **Blue:** the helper's body, linked to where it now lives.
- **Purple, boxed:** the call `cartItemTotal(item)` replaced by `price + shipping`.
- **Red:** the helper's `func` line and closing brace; its `return` is boxed as removed.

## In one line each

- **Extract:** code is taken apart and moved out into a new function.
- **Inline:** a function's code is moved back in, and the function is deleted.

## Notes for the docs page

- The Go example is Pierre's own test fixture (Apache-2.0), reproduced exactly by
  our engine.
- The icons for these two changes are still being decided; see
  `../design/icon-proposal.html` and `../design/icon-extract-inline.html`.
