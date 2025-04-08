/**
 * 端口规格定义
 */
export interface PortSpec {
    number: number;
    transport_protocol?: string;
    application_protocol?: string;
    wait?: boolean;
}

/**
 * 端口配置映射
 */
export type PortConfig = Record<string, PortSpec>;

/**
 * 公共端口配置
 * key: 端口名称 (如 'zkevm_prover_start_port')
 * value: 起始端口号
 */
export type StaticPorts = Record<string, number>;

/**
 * 排序端口配置对象的键值对
 * @param portConfig 端口配置对象
 * @returns 排序后的键值对数组
 */
export function sortPortConfigByValues(portConfig: PortConfig): [string, PortSpec][] {
    return Object.entries(portConfig).sort((a, b) => {
        const portA = a[1].number;
        const portB = b[1].number;
        return portA - portB;
    });
} 