import { CausalGraphSpec, CausalGraphNode, CausalGraphEdge } from '@simulens/shared';

export class CausalGraph {
  private spec: CausalGraphSpec;

  constructor(customSpec?: CausalGraphSpec) {
    this.spec = customSpec ?? CausalGraph.getDefaultSpec();
  }

  static getDefaultSpec(): CausalGraphSpec {
    const nodes: CausalGraphNode[] = [
      { id: 'machine_load', label: 'Machine Load', type: 'action', unit: '%' },
      { id: 'fan_speed', label: 'Fan Speed', type: 'action', unit: '%' },
      { id: 'coolant_flow', label: 'Coolant Flow', type: 'action', unit: '%' },
      { id: 'ambient_temperature', label: 'Ambient Temperature', type: 'environment', unit: '°C' },
      { id: 'machine_temperature', label: 'Machine Temperature', type: 'state', unit: '°C' },
      { id: 'pressure', label: 'System Pressure', type: 'state', unit: 'bar' },
      { id: 'power_consumption', label: 'Power Consumption', type: 'state', unit: 'kW' },
      { id: 'vibration', label: 'Vibration', type: 'state', unit: 'mm/s' },
      { id: 'fouling', label: 'Heat Exchanger Fouling', type: 'latent', unit: '0-1' },
    ];

    const edges: CausalGraphEdge[] = [
      // Direct causes of Temperature
      { source: 'machine_load', target: 'machine_temperature', isDirect: true, notes: 'Thermal heat generation' },
      { source: 'fan_speed', target: 'machine_temperature', isDirect: true, notes: 'Forced convection cooling' },
      { source: 'coolant_flow', target: 'machine_temperature', isDirect: true, notes: 'Liquid coolant heat absorption' },
      { source: 'ambient_temperature', target: 'machine_temperature', isDirect: true, notes: 'Thermal gradient boundary' },
      { source: 'fouling', target: 'machine_temperature', isDirect: true, notes: 'Latent heat transfer obstruction' },

      // Causes of Pressure
      { source: 'coolant_flow', target: 'pressure', isDirect: true, notes: 'Pump hydraulic pressure' },
      { source: 'machine_temperature', target: 'pressure', isDirect: true, notes: 'Thermal expansion' },

      // Causes of Power
      { source: 'machine_load', target: 'power_consumption', isDirect: true, notes: 'Spindle motor work' },
      { source: 'fan_speed', target: 'power_consumption', isDirect: true, notes: 'Fan cubic aerodynamic affinity' },
      { source: 'coolant_flow', target: 'power_consumption', isDirect: true, notes: 'Coolant pump power' },

      // Causes of Vibration (Note: Vibration is an EFFECT, never causes Temperature!)
      { source: 'machine_load', target: 'vibration', isDirect: true, notes: 'Mechanical motor torque stress' },
      { source: 'fan_speed', target: 'vibration', isDirect: true, notes: 'Aerodynamic rotor vibration' },
      { source: 'fouling', target: 'vibration', isDirect: true, notes: 'Latent turbulence from scale buildup' },
    ];

    return {
      version: '1.0.0',
      nodes,
      edges,
    };
  }

  getSpec(): CausalGraphSpec {
    return this.spec;
  }

  getParents(nodeId: string): string[] {
    return this.spec.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source);
  }

  getChildren(nodeId: string): string[] {
    return this.spec.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target);
  }

  /**
   * Perform Pearl's do() graph surgery:
   * Sever all incoming directed edges to the intervened variable
   */
  doSurgery(intervenedVariable: string): CausalGraphSpec {
    const surgicalEdges = this.spec.edges.filter((edge) => edge.target !== intervenedVariable);
    return {
      version: `${this.spec.version}-do(${intervenedVariable})`,
      nodes: [...this.spec.nodes],
      edges: surgicalEdges,
    };
  }
}
