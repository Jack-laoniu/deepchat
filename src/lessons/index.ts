import beijing from './beijing.json';
import car from './car.json';
import dogZh from './dog-zh.json';
import dog from './dog.json';
import farm from './farm.json';
import pcEn from './pc-en.json';
import pc from './pc.json';
import sleep from './sleep.json';
import travel from './travel.json';
import xianZh from './xian-zh.json';
import xian from './xian.json';

/** 全部示例关卡（测试用） */
export const SAMPLES: unknown[] = [car, sleep, farm, pc, travel, dogZh, beijing, pcEn, dog, xian, xianZh];

/** 首页展示的示例：只放旅游类（按界面语言筛选） */
export const SHOWCASE: unknown[] = [xianZh, travel, xian, beijing];
