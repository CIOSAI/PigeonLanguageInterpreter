# Pigeon Language(WIP, bugs alert)

Pigeon is a language invented by me, inspired by Python, Julia, Javascript and more.

This repo here is just for me to explore how it will be interpreted, not the final product (though I doubt that would be any far off)

Powered by [ohm.js](https://github.com/ohmjs/ohm) 😎

Inside `src` one can find the `Pigeon` folder, this is where the interpreting happens.

```
Pigeon
- Context.ts
- Type.ts
- Pigeon.ts
- grammar.ohm
```

## Pigeon

It consists of : 
- class `Pigeon`
- classes that implements interface `PigeonNode`
- function `pigeonStart()`

### Pigeon Class
This class holds the parser and context(where your variables are stored).
It takes a string of valid ohm language, then gives that to `ohm.grammar()` to generate a `ohm.Grammar` object, this is the parser.
The parser takes a string and ohm does some magic and boom.

### PigeonNode
It's a node on the abstract syntax tree (AST), every node has a `type()` function, it takes a `PigeonContextStack` and return the type of this node.

### `pigeonStart()`
When this function is called it creates a `Pigeon` instance with the grammar already passed in.

## Context

classes `PigeonContext` and `PigeonContextStack`

`PigeonContext` is a map with string for key and an object with mutability and `PigeonNode` for data.

`PigeonContextStack` is an array of `PigeonContext` and some helper function for pushing and popping a scope.

## Type

A PigeonType object has :
- a name(string)
- includes(against)=>boolean to check if type `against` can be seen as a kind of this type
- equals(against)=>boolean to check if type `against` is exactly equal to this type
- a nice visualizer

Complex Types check clusivity and equality with recursion, visualizes too.

## Grammar

This is the file for the grammar of Pigeon, it is a valid `ohm.js` ruleset.
