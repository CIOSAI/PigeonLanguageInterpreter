interface PigeonType {
  name: string;
  includes: (against: PigeonType) => boolean;
  equals: (against: PigeonType) => boolean;
  toString: () => string;
}

class PigeonPrimitive implements PigeonType {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  includes(against: PigeonType): boolean {
    return this.equals(against);
  }

  equals(against: PigeonType): boolean {
    return against.name == this.name;
  }

  toString(): string {
    return this.name;
  }
}

class PigeonComplexType implements PigeonType {
  name: string;
  args: PigeonType[];

  constructor(name: string, args: PigeonType[]) {
    this.name = name;
    this.args = args;
  }

  includes(against: PigeonType): boolean {
    if (!(against instanceof PigeonComplexType)) return false;
    if (against.name != this.name) return false;
    if (against.args.length != this.args.length) return false;
    for (let i = 0; i < this.args.length; i++) {
      if (!this.args[i].includes(against.args[i])) return false;
    }
    return true;
  }

  equals(against: PigeonType): boolean {
    if (!(against instanceof PigeonComplexType)) return false;
    if (against.name != this.name) return false;
    if (against.args.length != this.args.length) return false;
    for (let i = 0; i < this.args.length; i++) {
      if (!this.args[i].equals(against.args[i])) return false;
    }
    return true;
  }

  toString(): string {
    return this.name + "<" + this.args.map((a) => a.toString()).join(" ") + ">";
  }
}

class PigeonArrayType extends PigeonComplexType {
  constructor(type: PigeonType) {
    super("Array", [type]);
  }
  toString(): string {
    return this.args[0].toString() + "[]";
  }
}

class PigeonLambdaType extends PigeonComplexType {
  constructor(params: PigeonType[], output: PigeonType) {
    super("Lambda", [new PigeonComplexType("", params), output]);
  }
  toString(): string {
    return (
      "(" +
      (this.args[0] as PigeonComplexType).args
        .map((a) => a.toString())
        .join(" ") +
      "):" +
      this.args[1].toString()
    );
  }
}

class PigeonGeneric implements PigeonType {
  name: string = "T";

  includes(against: PigeonType): boolean {
    return true;
  }

  equals(against: PigeonType): boolean {
    console.warn("Generic type should not be compared");
    return against.name == "T";
  }

  toString(): string {
    return this.name;
  }
}

const TypeInt = new PigeonPrimitive("Int");
const TypeFloat = new PigeonPrimitive("Float");
const TypeString = new PigeonPrimitive("String");
const TypeBool = new PigeonPrimitive("Bool");
const TypeNull = new PigeonPrimitive("null");

export {
  type PigeonType,
  PigeonPrimitive,
  PigeonComplexType,
  PigeonArrayType,
  PigeonLambdaType,
  PigeonGeneric,
  TypeInt,
  TypeFloat,
  TypeString,
  TypeBool,
  TypeNull,
};
