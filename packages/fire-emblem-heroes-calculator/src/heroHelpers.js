// @flow
import stats, { getEventHeroes } from 'fire-emblem-heroes-stats';
import {
  allPass,
  // $FlowIssue ... no named export called `ascend`
  ascend,
  compose,
  concat,
  curry,
  // $FlowIssue ... no named export called `descend`
  descend,
  filter,
  indexBy,
  indexOf,
  map,
  mapObjIndexed,
  prop,
  propEq,
  propOr,
  pathOr,
  sort,
  // $FlowIssue ... no named export called `sortWith`
  sortWith,
  test,
  union,
  zipObj,
  __,
} from 'ramda';
import type {
  Hero,
  Skill,
  SkillType,
} from 'fire-emblem-heroes-stats';

import { getSkillInfo, getSkillType, getStatValue, hpRequirementSatisfied } from './skillHelpers';
import type { HeroInstance, InstanceSkills, Rarity, Stat } from './heroInstance';


export type HeroesByName = { [key: string]: Hero };

// $FlowIssue indexBy confuses flow
const heroesByName: HeroesByName = indexBy(
  prop('name'),
  // stats.heroes,
  concat(stats.heroes, getEventHeroes(true)),
);

/**
 * Look up a hero's base stats by name.
 *
 * @param {string} name The name of the hero to look up.
 * @returns {Hero} A raw hero object, from fire-emblem-heroes-stats.
 */
export const lookupStats = (name: string): Hero => {
  const hero: ?Hero = heroesByName[name];
  return hero || heroesByName['Anna'] || {
    name,
    weaponType: 'Red Sword',
    stats: { '1': {}, '40': {} },
    skills: [],
    moveType: 'Infantry',
  };
};

// Can be called with substrings of the skill name. Returns false if an hp requirement is not met.
export const hasSkill = (instance: HeroInstance, skillType: SkillType, expectedName: string) => {
  const skillName = getSkillName(instance, skillType);
  if (skillName !== undefined) {
    if (test(new RegExp(expectedName), skillName)) {
      return hpRequirementSatisfied(instance, skillType);
    }
  }
  return false;
};

// Returns the name of the skill object for the skill type
export function getSkillName(
  instance: HeroInstance,
  skillType: SkillType,
): string {
  return instance.skills[skillType] || '';
}

// Returns the effect description of a skill
export function getSkillEffect(
  instance: HeroInstance,
  skillType: SkillType,
): string {
  const skill = getSkillInfo(skillType, getSkillName(instance, skillType));
  return skill ? skill.effect : '';
}

// Returns a map from skill type to the skill object.
export function getDefaultSkills(name: string, rarity: Rarity = 5): InstanceSkills {
  const hero = lookupStats(name);
  // Flow can't follow this compose chain, so cast it to any.
  const skillsByType = (compose(
    indexBy(getSkillType),
    map(prop('name')),
    filter(skill => (skill.rarity === undefined || skill.rarity === '-' || skill.rarity <= rarity)),
  )(hero.skills): any);

  return {
    WEAPON: undefined,
    ASSIST: undefined,
    SPECIAL: undefined,
    PASSIVE_A: undefined,
    PASSIVE_B: undefined,
    PASSIVE_C: undefined,
    SEAL: undefined,
    ...skillsByType,
  };
}

// Updates the rarity and default skills for a hero.
export function updateRarity(hero: HeroInstance, newRarity: Rarity): HeroInstance {
  const oldDefault = getDefaultSkills(hero.name, hero.rarity);
  const newDefault = getDefaultSkills(hero.name, newRarity);
  return {
    ...hero,
    rarity: newRarity,
    // $FlowIssue Function cannot be called on member of intersection type
    skills: mapObjIndexed(
      ((skill, skillType) =>
        (propOr('', 'name', skill) === propOr('', 'name', oldDefault[skillType])
          ? newDefault[skillType] : skill)),
      hero.skills,
    ),
  };
}

// skill is 'any' because some fields are weapon/passive specific
const canInherit = curry((hero: Hero, skill: any): boolean => {
  const moveType = hero.moveType;
  const weaponType = hero.weaponType ;
  if (propEq('exclusive?', 'Yes', skill)) {
    return false;
  }
  // Unobtainable weapons (story only) currently have no weapon type.
  // Hero has weaponType 'Red Beast' and weapon has weaponType 'Breath'
  if (skill.type === 'WEAPON' && (skill.weaponType === undefined
    || (test(/Beast/, weaponType) ? 'Breath' : weaponType) !== skill.weaponType)) {
    return false;
  }
  const restriction = propOr('None', 'inheritRestriction', skill);
  switch (restriction) {
    case 'Axe Users Only':
      return weaponType === 'Green Axe';
    case 'Bow Users Only':
      return weaponType === 'Neutral Bow';
    case 'Fliers Only':
      return moveType === 'Flying';
    case 'Cavalry Only':
      return moveType === 'Cavalry';
    case 'Armored Only':
      return moveType === 'Armored';
    case 'Excludes Fliers':
      return moveType !== 'Flying';
    case 'Melee Weapons Only':
    case 'Melee Weapon Users Only':
      return test(/(Sword|Axe|Lance|Breath)/, weaponType);
    case 'Ranged Weapons Only':
    case 'Ranged Weapon Users Only':
      return test(/(Staff|Tome|Bow|Shuriken)/, weaponType);
    case 'Breath Users Only':
      return test(/Breath/, weaponType);
    case 'Staff Only':
    case 'Staff Users Only':
      return weaponType === 'Neutral Staff';
    case 'Excludes Staves':
    case 'Excludes Staff Users':
      return weaponType !== 'Neutral Staff';
    case 'Excludes Colorless Weapons':
    case 'Excludes Colorless Weapon Users':
      return !test(/Neutral/, weaponType);
    case 'Excludes Blue Weapons':
    case 'Excludes Blue Weapon Users':
      return !test(/Blue/, weaponType);
    case 'Excludes Red Weapons':
    case 'Excludes Red Weapon Users':
      return !test(/Red/, weaponType);
    case 'Excludes Green Weapons':
    case 'Excludes Green Weapon Users':
      return !test(/Green/, weaponType);
    case 'Is exclusive':
      return false;
    case 'None':
      return true;
    default:
      // console.log('Warning: unknown inherit restriction: ' + restriction);
  }
  return true;
});

// Returns a list of skills that a hero can obtain.
export function getInheritableSkills(name: string, skillType: SkillType): Array<Skill> {
  const hero = lookupStats(name);
  // Cast to any to prevent flow issues
  const allSkills: any = stats.skills;
  const inheritable = filter(
    allPass([
      // $FlowIssue canInherit is curried
      canInherit(hero),
      propEq('type', skillType),
    ]),
    allSkills,
  );
  const ownSkills = compose(
    filter((x) => propOr('', 'type', x) === skillType),
    map((skillName) => getSkillInfo(skillType, skillName)),
    map(prop('name')),
  )(hero.skills);
  return sort(ascend(prop('name')), union(inheritable, ownSkills));
}

export const hasBraveWeapon: (instance: HeroInstance)=> boolean = compose(
  test(/Brave|Dire/),
  pathOr('', ['skills', 'WEAPON']),
);

/**
 * A helper for getting a stat value from a hero by key.
 * Defaults to level 40, 5 star, baseline variant.
 *
 * @param {*} hero Hero to look up stat on
 * @param {*} statKey Key of the stat to look up
 * @param {*} level Which level version of stat to look up
 * @param {*} rarity Which rarity version of stat to look up
 * @param {*} variance Which variant ('low', 'normal', 'high') to look up
 * @param {*} isAttacker Whether or not the hero is the attacker.
 * @returns number the value of the stat
 */
export const getStat = (
  instance: HeroInstance,
  statKey: Stat,
  level: 1 | 40 = 40,
  isAttacker: boolean = false,
): number => {
  const hero = lookupStats(instance.name);
  const { rarity } = instance;
  const variance = (instance.boon === statKey
    ? 'high'
    : instance.bane === statKey
      ? 'low'
      : 'normal');

  if (level === 1) {
    const value = parseInt(hero.stats[`${level}`][rarity][statKey], 10);
    // skills and merges are currently not included in level 1 stats.
    return variance === 'normal'
      ? value
      : variance === 'low'
        ? value - 1
        : value + 1;
  }

  const values = hero.stats[`${level}`][rarity][statKey];
  const [low, normal, high] = values.length <= 1
    ? ['-', ...values]
    : values;
  const baseValue = variance === 'normal'
    ? parseInt(normal, 10)
    : variance === 'low'
      ? parseInt(low, 10)
      : parseInt(high, 10);

  // Every bonus level gives +1 to the next 2 stats, with stats in decreasing level 1 order
  const statKeys = ['hp', 'atk', 'spd', 'def', 'res'];
  // Depends on the fact that level 1 stats currently exclude skills.
  // $FlowIssue function cannot be called on any member of intersection type.
  const level1Stats = zipObj(statKeys, map((s) => getStat(instance, s, 1, false), statKeys));
  const orderedStatKeys = sortWith(
    [descend(prop(__, level1Stats)), ascend(indexOf(__, statKeys))],
    statKeys,
  );
  const mergeBonus = Math.floor((2*instance.mergeLevel)/5)
    + ((((2*instance.mergeLevel) % 5) > indexOf(statKey, orderedStatKeys)) ? 1 : 0);

  // TODO: buffs and Defiant abilities
  return baseValue
    + mergeBonus
    + getStatValue(instance, 'PASSIVE_A', statKey, isAttacker)
    + getStatValue(instance, 'SEAL', statKey, isAttacker)
    + getStatValue(instance, 'WEAPON', statKey, isAttacker);
};

export const getRange = (instance: HeroInstance) => {
  return test(/Sword|Axe|Lance|Beast/, lookupStats(instance.name).weaponType) ? 1 : 2;
};

export const getMitigationType = (instance: HeroInstance) => {
  return test(/Tome|Beast|Staff/, lookupStats(instance.name).weaponType) ? 'res' : 'def';
};

export const getWeaponColor = (instance: HeroInstance) => {
  switch (lookupStats(instance.name).weaponType) {
    case 'Red Sword':
    case 'Red Tome':
    case 'Red Beast':
      return 'RED';
    case 'Green Axe':
    case 'Green Tome':
    case 'Green Beast':
      return 'GREEN';
    case 'Blue Lance':
    case 'Blue Tome':
    case 'Blue Beast':
      return 'BLUE';
    default:
      return 'NEUTRAL';
  }
};

export const hasStatsForRarity = (hero: Hero, rarity: Rarity/* , level?: 1 | 40 */): boolean => {
  return Boolean(hero.stats['1'][`${rarity}`] && hero.stats['40'][`${rarity}`]);
};

// Returns whether or not hp >= X% of hp, using the hp at the start of combat.
export function hpAboveThreshold(hero: HeroInstance, hpPercent: number): boolean {
  return (getStat(hero, 'hp') - hero.initialHpMissing) >= (getStat(hero, 'hp') * hpPercent / 100);
}

// Returns whether or not hp <= X% of hp, using the hp at the start of combat.
export function hpBelowThreshold(hero: HeroInstance, hpPercent: number): boolean {
  return (getStat(hero, 'hp') - hero.initialHpMissing) <= (getStat(hero, 'hp') * hpPercent / 100);
}
