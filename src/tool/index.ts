// 工具声明：亚马逊订单库存导出（自定义界面；凭据只存本机，请求直接发往亚马逊官方接口）。
import { PackageSearch } from 'lucide-react';
import { createElement } from 'react';
import type { CustomTool } from '../kit/types';
import { Main } from './Main';

const tool: CustomTool = {
  id: 'e14',
  name: '亚马逊订单库存导出',
  tagline: '用你自己的卖家授权，通过亚马逊官方 SP-API 把订单、订单明细和 FBA 库存导出成 Excel。',
  icon: PackageSearch,
  category: '电商运营',
  type: 'data',
  mode: 'custom',
  mainLabel: '订单库存导出',
  params: [],
  Main: ({ ctx }) => createElement(Main, { ctx }),
};

export default tool;
