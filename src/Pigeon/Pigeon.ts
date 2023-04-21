import grammar from "./grammar.ohm?raw";
import * as ohm from "ohm-js";
import {
  PigeonType,
  PigeonPrimitive,
  PigeonComplexType,
  PigeonArrayType,
  PigeonLambdaType,
  TypeBool,
  TypeInt,
  TypeFloat,
  TypeNull,
  TypeString,
} from "./Type";
import { PigeonData, PigeonContext, PigeonContextStack } from "./Context";

const TypeUnknown = new PigeonPrimitive("Unknown");

interface PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
}

class PigeonLiteral implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: any;

  constructor(value: any, type: PigeonType) {
    this.value = value;
    this.type = (_) => type;
  }
}

class PigeonIdentifier implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: string;

  constructor(pigeon: Pigeon, value: string) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(value);

      if (search) {
        if (search[0]) {
          return search[0].data.type(contexts);
        } else {
          return TypeUnknown;
        }
      }
      pigeon.errorQueue.push(() => {
        pigeon.onVariableUsedBeforeDeclaration(value);
      });
      return TypeUnknown;
    };
  }
}

class PigeonTuple implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: PigeonNode[];

  constructor(pigeon: Pigeon, value: any[]) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) =>
      new PigeonComplexType(
        "Tuple",
        value.map((v) => v.type(contexts))
      );
  }
}

class PigeonArray implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  value: any[];

  constructor(pigeon: Pigeon, value: any[]) {
    this.value = value;
    let unknownTypeArray = new PigeonArrayType(TypeUnknown);
    this.type = (contexts: PigeonContextStack) => {
      if (this.value.length == 0) {
        return unknownTypeArray;
      } else {
        let type = this.value[0].type(contexts);
        for (let i = 1; i < this.value.length; i++) {
          if (this.value[i].type(contexts).equals(unknownTypeArray)) {
            pigeon.errorQueue.push(pigeon.onNestedUnknownContent);
            return unknownTypeArray;
          }
          if (!type.equals(this.value[i].type(contexts))) {
            pigeon.errorQueue.push(() => {
              pigeon.onItemTypeInconsistent(
                Array.from(new Set(this.value.map((v) => v.type(contexts))))
              );
            });
            return unknownTypeArray;
          }
        }
        return new PigeonArrayType(type);
      }
    };
  }
}

class PigeonFunctionCall implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  iden: PigeonIdentifier;
  args: Array<PigeonNode>;

  constructor(pigeon: Pigeon, iden: PigeonIdentifier, args: Array<PigeonNode>) {
    this.iden = iden;
    this.args = args;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(iden.value);
      if (search != undefined) {
        if (search.length != 0) {
          for (let targetData of search) {
            let target = targetData.data;
            if (!(target instanceof PigeonLambda)) continue;
            let lambda = target as PigeonLambda;
            if (
              lambda.args.every((arg, i) =>
                arg.type.includes(i in args ? args[i].type(contexts) : TypeNull)
              )
            ) {
              return lambda.type(contexts).args[1];
            } else {
              continue;
            }
          }
          pigeon.errorQueue.push(() => {
            pigeon.onNoMatchingInputFound(
              args.map((a) => a.type(contexts)),
              (search as PigeonData[]).map(
                (s) =>
                  (s.data.type(contexts) as PigeonLambdaType)
                    .args[0] as PigeonComplexType
              )
            );
          });
          return TypeUnknown;
        } else {
          return TypeUnknown;
        }
      }
      pigeon.errorQueue.push(() => {
        pigeon.onNoMatchingFunctionName(iden.value);
      });
      return TypeUnknown;
    };
  }
}

class PigeonLambda implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonLambdaType;
  args: { name: string; type: PigeonType }[];
  body: PigeonNode;

  constructor(
    pigeon: Pigeon,
    args: { name: string; type: PigeonType }[],
    body: PigeonNode
  ) {
    this.args = args;
    this.body = body;
    this.type = (contexts: PigeonContextStack) => {
      let localScope = new PigeonContext();
      for (let arg of args) {
        localScope.add(arg.name, {
          mut: true,
          data: new PigeonLiteral(null, arg.type),
        });
      }
      contexts.push(localScope);

      let lambdaType = new PigeonLambdaType(
        this.args.map((param) => param.type),
        this.body.type(contexts)
      );
      contexts.pop();
      return lambdaType;
    };
  }
}

class Pigeon {
  onItemTypeInconsistent: (types: PigeonType[]) => void = () => {};
  onNestedUnknownContent: () => void = () => {};
  onTypeMismatch: (expected: PigeonType, received: PigeonType) => void =
    () => {};
  onVariableRedeclared: (name: string) => void = () => {};
  onReassignNonExistentVariable: (name: string) => void = () => {};
  onReassignImmutableVariable: (name: string) => void = () => {};
  onVariableUsedBeforeDeclaration: (name: string) => void = () => {};
  onNoMatchingInputFound: (
    receivedArgs: PigeonType[],
    expectedArgList: PigeonComplexType[]
  ) => void = () => {};
  onNoMatchingFunctionName: (name: string) => void = () => {};
  onParseError: (message: string) => void = () => {};

  parser: ohm.Grammar;
  semantic: ohm.Semantics;
  contexts: PigeonContextStack = new PigeonContextStack();
  errorQueue: Array<() => void> = [];

  constructor(source_grammar: string) {
    let pigeon = this;
    this.contexts.add("uwu", {
      mut: false,
      data: new PigeonLiteral("uwu", TypeString),
    });
    this.contexts.add("STATUS_OK", {
      mut: false,
      data: new PigeonLiteral(201, TypeInt),
    });
    this.contexts.add("+-~%#_/", {
      mut: false,
      data: new PigeonLiteral("+-~%#_/", TypeString),
    });
    this.contexts.add("天地玄黃", {
      mut: false,
      data: new PigeonLiteral(69.69, TypeFloat),
    });

    this.contexts.add("log", {
      mut: false,
      data: new PigeonLambda(
        this,
        [{ name: "msg", type: TypeString }],
        new PigeonLiteral(null, TypeNull)
      ),
    });
    this.contexts.add("+", {
      mut: false,
      data: new PigeonLambda(
        this,
        [
          { name: "a", type: TypeInt },
          { name: "b", type: TypeInt },
        ],
        new PigeonLiteral(0, TypeInt)
      ),
    });

    this.parser = ohm.grammar(source_grammar);
    this.semantic = this.parser.createSemantics();
    this.semantic.addOperation("parse", {
      Program(statements) {
        return statements.children.map((child) => {
          return child.parse();
        });
      },
      Line(statement, _) {
        return statement.parse();
      },
      Statement(node) {
        return node.parse();
      },
      FunctionCall(iden, leftBracket, args, rightBracket) {
        let items = args.asIteration().children.map((child) => child.parse());
        return new PigeonFunctionCall(pigeon, iden.parse(), items);
      },
      Lambda(leftBracket, args, rightBracket, type, arrow, body) {
        let params = args.asIteration().children.map((child) => child.parse());

        let node = new PigeonLambda(pigeon, params, body.parse());
        if (type.numChildren != 0) {
          let expectedReturnType = type.child(0).parse();
          if (!expectedReturnType.equals(node.type(pigeon.contexts).args[1])) {
            pigeon.errorQueue.push(() => {
              pigeon.onTypeMismatch(
                expectedReturnType,
                node.type(pigeon.contexts)
              );
            });
          }
        }
        return node;
      },
      Input(iden, type) {
        return { name: iden.sourceString, type: type.parse() };
      },
      Declaration(action, iden, type, value) {
        let data = value.parse();
        if (type.numChildren != 0) {
          let expectedType = type.child(0).parse();
          if (!expectedType.equals(data.type(pigeon.contexts))) {
            pigeon.errorQueue.push(() => {
              pigeon.onTypeMismatch(expectedType, data.type(pigeon.contexts));
            });
            return new PigeonLiteral(null, TypeNull);
          }
        }
        action.parse()(iden.sourceString, value.parse());
        return new PigeonLiteral(null, TypeNull);
      },
      Declarator(content) {
        let action = content.sourceString as "let" | "mut" | "set";

        let ifNameCollided = (name: string, value: PigeonNode): boolean => {
          let exist = pigeon.contexts.get(name);
          if (exist != undefined) {
            if (
              !(
                value.type(pigeon.contexts) instanceof PigeonLambdaType &&
                exist[0].data.type(pigeon.contexts) instanceof PigeonLambdaType
              )
            ) {
              pigeon.errorQueue.push(() => {
                pigeon.onVariableRedeclared(name);
              });
              return true;
            }
          }
          return false;
        };

        if (action == "let") {
          return (name: string, value: PigeonNode) => {
            if (ifNameCollided(name, value)) return;
            pigeon.contexts.add(name, { mut: false, data: value });
          };
        } else if (action == "mut") {
          return (name: string, value: PigeonNode) => {
            if (ifNameCollided(name, value)) return;
            pigeon.contexts.add(name, { mut: true, data: value });
          };
        } else {
          return (name: string, value: PigeonNode) => {
            let result = pigeon.contexts.get(name);
            // set for lambda overloading not currently supported
            if (result == undefined) {
              pigeon.errorQueue.push(() => {
                pigeon.onReassignNonExistentVariable(name);
              });
              return;
            }
            if (!result[0].mut) {
              pigeon.errorQueue.push(() => {
                pigeon.onReassignImmutableVariable(name);
              });
              return;
            }
            result[0] = { mut: true, data: value };
          };
        }
      },
      Typing(colon, type) {
        return new PigeonPrimitive(type.sourceString);
      },
      Tuple(leftBracket, content, rightBracket) {
        let items = content
          .asIteration()
          .children.map((child) => child.parse());

        return new PigeonTuple(pigeon, items);
      },
      Array(leftBracket, content, rightBracket) {
        let items = content
          .asIteration()
          .children.map((child) => child.parse());

        return new PigeonArray(pigeon, items);
      },
      iden(head, tail) {
        return new PigeonIdentifier(pigeon, this.sourceString);
      },
      Number(neg, numeral) {
        let num = numeral.parse();
        if (neg.sourceString == "-") {
          num.value = -num.value;
        }
        return num;
      },
      Int(digits) {
        return new PigeonLiteral(parseInt(digits.sourceString), TypeInt);
      },
      Bool(node) {
        return new PigeonLiteral(node.sourceString == "TRUE", TypeBool);
      },
      Float(node) {
        return new PigeonLiteral(node.parse(), TypeFloat);
      },
      Float_startedWithDigit(whole, _, decimals) {
        return parseFloat(whole.sourceString + "." + decimals.sourceString);
      },
      Float_startedWithDot(_, decimals) {
        return parseFloat("0." + decimals.sourceString);
      },
      str(leftTick, content, rightTick) {
        let str = content.children
          .map((x) => x.parse())
          .reduce((prev, curr) => prev + curr, "");
        return new PigeonLiteral(str, TypeString);
      },
      strContent_nonEscaped(char) {
        return char.source.contents;
      },
      strContent_escaped(_, char) {
        let escaped = new Map([
          ["b", "\b"],
          ["f", "\f"],
          ["n", "\n"],
          ["r", "\r"],
          ["t", "\t"],
          ["v", "\v"],
          ["\\", "\\"],
          ["`", "`"],
        ]);
        let c = escaped.get(char.source.contents);
        return c ? c : "\\" + char.source.contents;
      },
      discard(_) {
        return new PigeonLiteral("Discard", TypeNull);
      },
      Nothing(_) {
        return new PigeonLiteral(null, TypeNull);
      },
      comment(_) {},
      end(_) {},
    } as ohm.ActionDict<any>);
  }

  parse(input: string): { legal: boolean; result: any } {
    let match = this.parser.match(input);
    if (match.failed()) {
      this.errorQueue.push(() => {
        this.onParseError(match.message ?? "no error message");
      });
      return { legal: false, result: undefined };
    }
    let parsed = this.semantic(match).parse();
    if (this.errorQueue.length > 0) {
      this.errorQueue.forEach((x) => x());
      return { legal: false, result: undefined };
    }
    return { legal: true, result: parsed };
  }
}

function pigeonStart(): Pigeon {
  return new Pigeon(grammar);
}

export { pigeonStart, Pigeon, type PigeonNode };
