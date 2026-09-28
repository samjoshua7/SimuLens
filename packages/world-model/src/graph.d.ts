import { CausalGraphSpec } from '@simulens/shared';
export declare class CausalGraph {
    private spec;
    constructor(customSpec?: CausalGraphSpec);
    static getDefaultSpec(): CausalGraphSpec;
    getSpec(): CausalGraphSpec;
    getParents(nodeId: string): string[];
    getChildren(nodeId: string): string[];
    /**
     * Perform Pearl's do() graph surgery:
     * Sever all incoming directed edges to the intervened variable
     */
    doSurgery(intervenedVariable: string): CausalGraphSpec;
}
//# sourceMappingURL=graph.d.ts.map