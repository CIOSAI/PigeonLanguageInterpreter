import { PigeonNode } from "./Pigeon";

interface PigeonData {
  mut: boolean;
  data: PigeonNode;
}

class PigeonContext {
  context: Map<string, PigeonData[]> = new Map();

  add(name: string, node: PigeonData) {
    //duplication not accounted yet
    let search = this.context.get(name);
    if (search) {
      search.push(node);
    } else {
      this.context.set(name, [node]);
    }
  }

  get(name: string) {
    return this.context.get(name);
  }
}

class PigeonContextStack {
  stack: PigeonContext[] = [new PigeonContext()];

  push(context: PigeonContext) {
    this.stack.push(context);
  }

  pop() {
    this.stack.pop();
  }

  add(name: string, node: PigeonData) {
    this.stack[this.stack.length - 1].add(name, node);
  }

  get(name: string) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      let search = this.stack[i].get(name);
      if (search) {
        return search;
      }
    }
    return undefined;
  }
}

export { PigeonContext, PigeonContextStack };
