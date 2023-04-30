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

interface PigeonResult {
  form: "value" | "null" | "block";
  value: any;
}

interface PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
}
const mutData = (content: PigeonNode) => {
  return { mut: true, data: content, evaluation: undefined };
};
const constData = (content: PigeonNode) => {
  return { mut: false, data: content, evaluation: undefined };
};

class PigeonLiteral implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  value: any;

  constructor(value: any, type: PigeonType) {
    this.value = value;
    this.type = (_) => type;
    this.eval = (_) => {
      return { form: "value", value: value };
    };
  }
}

class PigeonIdentifier implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  value: string;

  constructor(pigeon: Pigeon, source: ohm.Node, value: string) {
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
        pigeon.onVariableUsedBeforeDeclaration(source);
      });
      return TypeUnknown;
    };
    this.eval = (contexts) => {
      let search = contexts.get(value);
      if (search == undefined) {
        throw new Error(`Variable '${value}' used before declaration `);
      } else {
        return { form: "value", value: search[0].evaluation };
      }
    };
  }
}

class PigeonTuple implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  value: PigeonNode[];

  constructor(value: any[]) {
    this.value = value;
    this.type = (contexts: PigeonContextStack) =>
      new PigeonComplexType(
        "Tuple",
        value.map((v) => v.type(contexts))
      );
    this.eval = (contexts) => {
      return {
        form: "value",
        value: this.value.map((x) => x.eval(contexts).value),
      };
    };
  }
}

class PigeonArray implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  value: any[];

  constructor(pigeon: Pigeon, source: ohm.Node, value: any[]) {
    this.value = value;
    let unknownTypeArray = new PigeonArrayType(TypeUnknown);
    this.type = (contexts: PigeonContextStack) => {
      if (this.value.length == 0) {
        return unknownTypeArray;
      } else {
        let type = this.value[0].type(contexts);
        for (let i = 1; i < this.value.length; i++) {
          if (this.value[i].type(contexts).equals(unknownTypeArray)) {
            pigeon.errorQueue.push(() => {
              pigeon.onNestedUnknownContent(source);
            });
            return unknownTypeArray;
          }
          if (!type.equals(this.value[i].type(contexts))) {
            pigeon.errorQueue.push(() => {
              pigeon.onItemTypeInconsistent(
                source,
                Array.from(new Set(this.value.map((v) => v.type(contexts))))
              );
            });
            return unknownTypeArray;
          }
        }
        return new PigeonArrayType(type);
      }
    };
    this.eval = (contexts) => {
      return {
        form: "value",
        value: this.value.map((x) => x.eval(contexts).value),
      };
    };
  }
}

class PigeonFunctionCall implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  iden: PigeonIdentifier;
  args: Array<PigeonNode>;

  constructor(
    pigeon: Pigeon,
    source: ohm.Node,
    iden: PigeonIdentifier,
    args: Array<PigeonNode>
  ) {
    this.iden = iden;
    this.args = args;
    this.type = (contexts: PigeonContextStack) => {
      let search = contexts.get(iden.value);
      if (search != undefined) {
        if (search.length != 0) {
          for (let targetData of search) {
            let target = targetData.data;
            if (!(target.type(contexts) instanceof PigeonLambdaType)) continue;
            if (target instanceof PigeonLambda) {
              // user defined function
              if (
                target.args.every((arg, i) =>
                  arg.type.includes(
                    i in args ? args[i].type(contexts) : TypeNull
                  )
                )
              ) {
                return target.type(contexts).args[1];
              } else {
                continue;
              }
            } else {
              // native function
              let lambda = target as PigeonPrebuiltLambda;
              if (
                lambda.args.every((arg, i) =>
                  arg.includes(i in args ? args[i].type(contexts) : TypeNull)
                )
              ) {
                return lambda.type(contexts).args[1];
              } else {
                continue;
              }
            }
          }
          pigeon.errorQueue.push(() => {
            pigeon.onNoMatchingInputFound(
              source,
              (search as PigeonData[]).map(
                (s) =>
                  (s.data.type(contexts) as PigeonLambdaType)
                    .args[0] as PigeonComplexType
              ),
              args.map((a) => a.type(contexts))
            );
          });
          return TypeUnknown;
        } else {
          return TypeUnknown;
        }
      }
      pigeon.errorQueue.push(() => {
        pigeon.onNoMatchingFunctionName(source);
      });
      return TypeUnknown;
    };
    this.eval = (contexts) => {
      let toCall = this.iden.eval(contexts).value;
      let params = this.args.map((arg) => arg.eval(contexts).value);
      return { form: "value", value: toCall(params) };
    };
  }
}

class PigeonLambda implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonLambdaType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  args: { name: string; type: PigeonType }[];
  body: PigeonNode;

  constructor(args: { name: string; type: PigeonType }[], body: PigeonNode) {
    this.args = args;
    this.body = body;
    this.type = (contexts: PigeonContextStack) => {
      let localScope = new PigeonContext();
      contexts.push(localScope);
      for (let arg of args) {
        let pseudoData: PigeonNode = new PigeonLiteral(null, arg.type);
        if (arg.type instanceof PigeonLambdaType) {
          pseudoData = new PigeonPrebuiltLambda(
            (arg.type.args[0] as PigeonComplexType).args,
            arg.type.args[1],
            () => {}
          );
        }
        contexts.add(arg.name, mutData(pseudoData));
      }

      let lambdaType = new PigeonLambdaType(
        this.args.map((param) => param.type),
        this.body.type(contexts)
      );
      contexts.pop();
      return lambdaType;
    };
    this.eval = (contexts) => {
      return {
        form: "value",
        value: (params: Array<any>) => {
          if (params.length != this.args.length)
            throw new Error("Invalid number of arguments");

          let blockHalt = false;

          let localScope = new PigeonContext();
          for (let i = 0; i < args.length; i++) {
            localScope.add(this.args[i].name, {
              mut: true,
              data: new PigeonLiteral(params[i], this.args[i].type),
              evaluation: params[i],
            });
            if (typeof params[i] == "function") {
              if (params[i].name == "breakCallback") {
                (
                  localScope.get(this.args[i].name) as PigeonData[]
                )[0].evaluation = () => {
                  params[i]();
                  blockHalt = true;
                };
              }
            }
          }

          contexts.push(localScope);

          let returnedValue = null;
          let lambdaResult = this.body.eval(contexts);
          if (lambdaResult.form == "block") {
            while (true) {
              let next = lambdaResult.value.next();
              if (next.done) break;
              returnedValue = next.value;
              if (blockHalt) {
                returnedValue = null;
                break;
              }
            }
          } else {
            returnedValue = lambdaResult.value;
          }

          contexts.pop();

          return returnedValue;
        },
      };
    };
  }
}

class PigeonPrebuiltLambda implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonLambdaType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  args: PigeonType[];

  constructor(args: PigeonType[], output: PigeonType, func: Function) {
    this.args = args;
    this.type = (contexts: PigeonContextStack) => {
      return new PigeonLambdaType(this.args, output);
    };
    this.eval = (contexts) => {
      return {
        form: "value",
        value: (params: Array<any>) => {
          if (params.length != this.args.length)
            throw new Error("Invalid number of arguments");
          try {
            return func(...params);
          } catch (error) {
            throw new Error("Internal error: " + error);
          }
        },
      };
    };
  }
}

class PigeonLet implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  iden: string;
  value: PigeonNode;
  constructor(pigeon: Pigeon, iden: ohm.Node, value: PigeonNode) {
    this.iden = iden.sourceString;
    this.value = value;
    this.type = (contexts: PigeonContextStack) => {
      this.parse(pigeon, iden);
      return TypeNull;
    };
    this.eval = (contexts) => {
      let exist = contexts.get(this.iden);
      if (exist != undefined)
        throw new Error(`Variable '${this.iden}' already exists`);
      contexts.add(this.iden, {
        mut: false,
        data: this.value,
        evaluation: this.value.eval(contexts).value,
      });
      return { form: "null", value: null };
    };
  }
  parse(pigeon: Pigeon, iden: ohm.Node) {
    let exist = pigeon.contexts.get(this.iden);
    if (exist != undefined) {
      if (
        !(
          this.value.type(pigeon.contexts) instanceof PigeonLambdaType &&
          exist[0].data.type(pigeon.contexts) instanceof PigeonLambdaType
        )
      ) {
        pigeon.errorQueue.push(() => {
          pigeon.onVariableRedeclared(iden);
        });
        return;
      }
    }
    pigeon.contexts.add(this.iden, constData(this.value));
  }
}

class PigeonMut implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  iden: string;
  value: PigeonNode;
  constructor(pigeon: Pigeon, iden: ohm.Node, value: PigeonNode) {
    this.iden = iden.sourceString;
    this.value = value;
    this.type = (contexts: PigeonContextStack) => {
      this.parse(pigeon, iden);
      return TypeNull;
    };
    this.eval = (contexts) => {
      let exist = contexts.get(this.iden);
      if (exist != undefined)
        throw new Error(`Variable '${this.iden}' already exists`);
      contexts.add(this.iden, {
        mut: true,
        data: this.value,
        evaluation: this.value.eval(contexts).value,
      });
      return { form: "null", value: null };
    };
  }
  parse(pigeon: Pigeon, iden: ohm.Node) {
    let exist = pigeon.contexts.get(this.iden);
    if (exist != undefined) {
      if (
        !(
          this.value.type(pigeon.contexts) instanceof PigeonLambdaType &&
          exist[0].data.type(pigeon.contexts) instanceof PigeonLambdaType
        )
      ) {
        pigeon.errorQueue.push(() => {
          pigeon.onVariableRedeclared(iden);
        });
        return;
      }
    }
    pigeon.contexts.add(this.iden, mutData(this.value));
  }
}

class PigeonSet implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  iden: string;
  value: PigeonNode;
  constructor(pigeon: Pigeon, iden: ohm.Node, value: PigeonNode) {
    this.iden = iden.sourceString;
    this.value = value;
    this.parse(pigeon, iden);
    this.type = (contexts: PigeonContextStack) => TypeNull;
    this.eval = (contexts) => {
      let result = contexts.get(this.iden);
      if (result == undefined)
        throw new Error(`Variable '${this.iden}' not found`);
      if (!result[0].mut)
        throw new Error(`Variable '${this.iden}' is immutable`);
      if (!result[0].data.type(contexts).includes(this.value.type(contexts))) {
        throw new Error(
          `Type mismatch: expected ${result[0].data
            .type(contexts)
            .toString()} but got ${this.value.type(contexts).toString()}`
        );
      }
      result[0].evaluation = this.value.eval(contexts).value;
      return { form: "null", value: null };
    };
  }
  parse(pigeon: Pigeon, iden: ohm.Node) {
    let result = pigeon.contexts.get(this.iden);
    // set for lambda overloading not currently supported
    if (result == undefined) {
      pigeon.errorQueue.push(() => {
        pigeon.onReassignNonExistentVariable(iden);
      });
      return;
    }
    if (!result[0].mut) {
      pigeon.errorQueue.push(() => {
        pigeon.onReassignImmutableVariable(iden);
      });
      return;
    }
    if (
      !result[0].data
        .type(pigeon.contexts)
        .includes(this.value.type(pigeon.contexts))
    ) {
      pigeon.errorQueue.push(() => {
        pigeon.onTypeMismatch(
          iden,
          (result as PigeonData[])[0].data.type(pigeon.contexts),
          this.value.type(pigeon.contexts)
        );
      });
      return;
    }
    result[0] = mutData(this.value);
  }
}

class PigeonConditional implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  triggered?: boolean;
  body: PigeonNode;

  constructor(onTrue: boolean, condNode: PigeonNode, body: PigeonNode) {
    this.body = body;
    this.type = (_) => TypeNull;
    this.eval = (contexts) => {
      if (onTrue == condNode.eval(contexts).value) {
        this.triggered = true;
        let evaluated = body.eval(contexts);
        if (evaluated.form == "block") {
          let lastValue = null;
          while (true) {
            let next = evaluated.value.next();
            if (next.done) break;
            lastValue = next.value;
          }
          return {
            form: lastValue == null ? "null" : "value",
            value: lastValue,
          };
        } else {
          return { form: "value", value: evaluated.value };
        }
      } else this.triggered = false;
      return { form: "null", value: null };
    };
  }
}

class PigeonReturn implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  returnAt: ohm.Node;

  constructor(value: PigeonNode, returnAt: ohm.Node) {
    this.returnAt = returnAt;
    this.type = (contexts) => value.type(contexts);
    this.eval = (contexts) => value.eval(contexts);
  }
}

class PigeonBlock implements PigeonNode {
  type: (contexts: PigeonContextStack) => PigeonType;
  eval: (contexts: PigeonContextStack) => PigeonResult;
  constructor(pigeon: Pigeon, lines: PigeonNode[]) {
    this.type = (contexts: PigeonContextStack) => {
      contexts.push(new PigeonContext());

      let returnNodes: PigeonNode[] = [new PigeonLiteral(null, TypeNull)];

      lines.forEach((line) => {
        if (line instanceof PigeonReturn) {
          returnNodes.push(line);
        } else if (line instanceof PigeonConditional) {
          if (line.body instanceof PigeonReturn) {
            returnNodes.push(line.body);
          }
        }
        returnNodes[0] = new PigeonLiteral(null, line.type(contexts));
      });

      for (let i = 1; i < returnNodes.length; i++) {
        if (
          !returnNodes[0].type(contexts).includes(returnNodes[i].type(contexts))
        ) {
          pigeon.errorQueue.push(() => {
            pigeon.onReturnTypeInconsistent(
              (returnNodes[i] as PigeonReturn).returnAt,
              returnNodes.map((node) => node.type(contexts))
            );
          });
          return TypeNull;
        }
      }

      let lastType = returnNodes[0].type(contexts);

      contexts.pop();

      return lastType;
    };
    this.eval = (contexts: PigeonContextStack) => {
      function* blockFeed() {
        contexts.push(new PigeonContext());
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (line instanceof PigeonReturn) {
            let returnedValue = line.eval(contexts).value;
            contexts.pop();
            yield returnedValue;
            return;
          } else if (line instanceof PigeonConditional) {
            let condLine = line as PigeonConditional;
            if (condLine.body instanceof PigeonReturn) {
              let result = condLine.eval(contexts).value;
              if (condLine.triggered) {
                contexts.pop();
                yield result;
                return;
              }
            }
          }

          let evaluated = lines[i].eval(contexts);
          if (evaluated.form == "block") {
            let lastValue = null;
            while (true) {
              let next = evaluated.value.next();
              if (next.done) break;
              lastValue = next.value;
            }
            yield lastValue;
          } else {
            yield evaluated.value;
          }
        }
        contexts.pop();
      }
      return { form: "block", value: blockFeed() };
    };
  }
}

class Pigeon {
  onItemTypeInconsistent: (source: ohm.Node, types: PigeonType[]) => void =
    () => {
      console.error("unhandled error: onItemTypeInconsistent");
    };
  onReturnTypeInconsistent: (source: ohm.Node, types: PigeonType[]) => void =
    () => {
      console.error("unhandled error: onReturnTypeInconsistent");
    };
  onNestedUnknownContent: (source: ohm.Node) => void = () => {
    console.error("unhandled error: onNestedUnknownContent");
  };
  onTypeMismatch: (
    source: ohm.Node,
    expected: PigeonType,
    received: PigeonType
  ) => void = () => {
    console.error("unhandled error: onTypeMismatch");
  };
  onVariableRedeclared: (source: ohm.Node) => void = () => {
    console.error("unhandled error: onVariableRedeclared");
  };
  onReassignNonExistentVariable: (source: ohm.Node) => void = () => {
    console.error("unhandled error: onReassignNonExistentVariable");
  };
  onReassignImmutableVariable: (source: ohm.Node) => void = () => {
    console.error("unhandled error: onReassignImmutableVariable");
  };
  onVariableUsedBeforeDeclaration: (source: ohm.Node) => void = () => {
    console.error("unhandled error: onVariableUsedBeforeDeclaration");
  };
  onNoMatchingInputFound: (
    source: ohm.Node,
    expectedArgList: PigeonComplexType[],
    receivedArgs: PigeonType[]
  ) => void = () => {
    console.error("unhandled error: onNoMatchingInputFound");
  };
  onNoMatchingFunctionName: (source: ohm.Node) => void = () => {
    console.error("unhandled error: onNoMatchingFunctionName");
  };
  onParseError: (message: string) => void = () => {
    console.error("unhandled error: onParseError");
  };

  parser: ohm.Grammar;
  semantic: ohm.Semantics;
  contexts: PigeonContextStack = new PigeonContextStack();
  errorQueue: Array<() => void> = [];

  constructor(source_grammar: string) {
    let pigeon = this;
    // this.contexts.add("uwu", {
    //   mut: false,
    //   data: new PigeonLiteral("uwu", TypeString),
    // });
    // this.contexts.add("STATUS_OK", {
    //   mut: false,
    //   data: new PigeonLiteral(201, TypeInt),
    // });
    // this.contexts.add("+-~%#_/", {
    //   mut: false,
    //   data: new PigeonLiteral("+-~%#_/", TypeString),
    // });
    // this.contexts.add("天地玄黃", {
    //   mut: false,
    //   data: new PigeonLiteral(69.69, TypeFloat),
    // });

    let addGlobalPrebuilt = (name: string, content: PigeonNode) => {
      this.contexts.add(name, {
        mut: false,
        data: content,
        evaluation: content.eval(this.contexts).value,
      });
    };
    addGlobalPrebuilt(
      "len",
      new PigeonPrebuiltLambda([TypeString], TypeInt, (arg: string) => {
        return { form: "value", value: arg.length };
      })
    );
    addGlobalPrebuilt(
      "log",
      new PigeonPrebuiltLambda([TypeInt], TypeNull, (arg: any) => {
        console.log(arg);
        return { form: "null", value: null };
      })
    );
    addGlobalPrebuilt(
      "for",
      new PigeonPrebuiltLambda(
        [
          TypeInt,
          new PigeonLambdaType(
            [TypeInt, new PigeonLambdaType([], TypeNull)],
            TypeNull
          ),
        ],
        TypeNull,
        (amt: number, callback: (params: any[]) => void) => {
          for (let i = 0; i < amt; i++) {
            let broke = false;
            let breakCallback = () => {
              broke = true;
            };
            callback([i, breakCallback]);
            if (broke) break;
          }
          return { form: "null", value: null };
        }
      )
    );
    addGlobalPrebuilt(
      ">",
      new PigeonPrebuiltLambda(
        [TypeInt, TypeInt],
        TypeBool,
        (a: number, b: number) => {
          return { form: "value", value: a > b };
        }
      )
    );

    this.parser = ohm.grammar(source_grammar);
    this.semantic = this.parser.createSemantics();
    this.semantic.addOperation("parse", {
      Program(statements) {
        return statements.children.map((child) => {
          return child.parse();
        });
      },
      Block(leftBracket, statements, rightBracket) {
        return new PigeonBlock(
          pigeon,
          statements.children.map((child) => child.parse())
        );
      },
      Line(statement, _) {
        return statement.parse();
      },
      Statement(node) {
        return node.parse();
      },
      FunctionCall(iden, leftBracket, args, rightBracket) {
        let items = args.asIteration().children.map((child) => child.parse());
        return new PigeonFunctionCall(pigeon, this, iden.parse(), items);
      },
      Lambda(leftBracket, args, rightBracket, type, arrow, body) {
        let params = args.asIteration().children.map((child) => child.parse());

        let node = new PigeonLambda(params, body.parse());
        if (type.numChildren != 0) {
          let expectedReturnType = type.child(0).parse();
          if (!expectedReturnType.equals(node.type(pigeon.contexts).args[1])) {
            pigeon.errorQueue.push(() => {
              pigeon.onTypeMismatch(
                this,
                expectedReturnType,
                node.type(pigeon.contexts).args[1]
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
              pigeon.onTypeMismatch(
                this,
                expectedType,
                data.type(pigeon.contexts)
              );
            });
            return new PigeonLiteral(null, TypeNull);
          }
        }
        if (action.parse() == "let") {
          return new PigeonLet(pigeon, iden, value.parse());
        } else if (action.parse() == "mut") {
          return new PigeonMut(pigeon, iden, value.parse());
        } else {
          return new PigeonSet(pigeon, iden, value.parse());
        }
      },
      Declarator(content) {
        return content.sourceString as "let" | "mut" | "set";
      },
      Conditional(whenUnless, cond, body) {
        let condNode = cond.parse();
        if (!TypeBool.includes(condNode.type(pigeon.contexts))) {
          pigeon.errorQueue.push(() => {
            pigeon.onTypeMismatch(
              this,
              TypeBool,
              condNode.type(pigeon.contexts)
            );
          });
          return new PigeonLiteral(null, TypeNull);
        }
        return new PigeonConditional(
          whenUnless.parse() == "when",
          condNode,
          body.parse()
        );
      },
      Return(tag, value) {
        return new PigeonReturn(value.parse(), this);
      },
      WhenUnless(content) {
        return content.sourceString as "when" | "unless";
      },
      LambdaType(leftBracket, args, rightBracket, returnType) {
        return new PigeonLambdaType(
          args.asIteration().children.map((child) => child.parse()),
          returnType.parse()
        );
      },
      TupleType(leftBracket, args, rightBracket) {
        return new PigeonComplexType(
          "Tuple",
          args.asIteration().children.map((arg: ohm.Node) => arg.parse())
        );
      },
      ArrayType(type, _) {
        return new PigeonArrayType(type.parse());
      },
      primitiveType(type) {
        return new PigeonPrimitive(type.sourceString);
      },
      customType(head, type) {
        return new PigeonPrimitive(type.sourceString);
      },
      Typing(colon, type) {
        return type.parse();
      },
      Tuple(leftBracket, content, rightBracket) {
        let items = content
          .asIteration()
          .children.map((child) => child.parse());

        return new PigeonTuple(items);
      },
      Array(leftBracket, content, rightBracket) {
        let items = content
          .asIteration()
          .children.map((child) => child.parse());

        return new PigeonArray(pigeon, this, items);
      },
      iden(head, tail) {
        return new PigeonIdentifier(pigeon, this, this.sourceString);
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

  parse(input: string): { legal: boolean; result: PigeonNode[] } {
    let match = this.parser.match(input);
    if (match.failed()) {
      this.errorQueue.push(() => {
        this.onParseError(match.message ?? "no error message");
      });
      return { legal: false, result: [] };
    }

    this.contexts.push(new PigeonContext());
    let parsed = this.semantic(match).parse();
    this.contexts.pop();

    if (this.errorQueue.length > 0) {
      this.errorQueue.forEach((x) => x());
      return { legal: false, result: [] };
    }
    return { legal: true, result: parsed };
  }

  interpret(input: {
    legal: boolean;
    result: PigeonNode[];
  }): Generator<any, void, void> {
    if (!input.legal) throw new Error("input is illegal");
    let parsed = input.result as PigeonNode[]; //result is guaranteed to be defined when input is legal
    this.contexts.push(new PigeonContext());
    let lines = parsed.map((x) => () => x.eval(this.contexts));
    function* generator() {
      for (let line of lines) {
        let lineResult = line();
        if (lineResult.form == "block") {
          while (true) {
            let next = lineResult.value.next();
            if (next.done) break;
            yield next.value;
          }
        } else {
          yield lineResult.value;
        }
      }
    }
    return generator();
  }
}

function pigeonStart(): Pigeon {
  return new Pigeon(grammar);
}

export { pigeonStart, Pigeon, type PigeonNode };
