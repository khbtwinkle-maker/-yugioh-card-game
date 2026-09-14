// 카드 풀 정의 (몬스터 20장 + 마법 6장 = 26장)
const CARD_POOL = [
  // ---- 몬스터 ---- (효과 텍스트는 분위기 연출용 설명이며 실제 게임 로직에는 영향을 주지 않음)
  { id: 'm01', name: '흑염의 드래곤', type: 'monster', atk: 3000, def: 2500, image: 'cards/m01.jpg', description: '이 카드가 일반 소환/특수 소환에 성공했을 때, 상대 필드의 모든 몬스터를 파괴한다.' },
  { id: 'm02', name: '빛의 성기사', type: 'monster', atk: 2500, def: 2000, image: 'cards/m02.jpg', description: '이 카드가 전투로 몬스터를 파괴했을 때, 자신은 덱에서 1장 드로우한다.' },
  { id: 'm03', name: '심연의 마물', type: 'monster', atk: 2200, def: 1800, image: 'cards/m03.jpg', description: '이 카드가 특수 소환에 성공했을 때, 상대 필드의 몬스터 1장의 효과를 무효로 한다.' },
  { id: 'm04', name: '불꽃의 피닉스', type: 'monster', atk: 2400, def: 1600, image: 'cards/m04.jpg', description: '이 카드가 묘지로 보내졌을 경우, 자신의 묘지에서 레벨 4 이하의 몬스터 1장을 특수 소환할 수 있다.' },
  { id: 'm05', name: '대지의 골렘', type: 'monster', atk: 2600, def: 2200, image: 'cards/m05.jpg', description: '이 카드가 일반 소환에 성공했을 때, 자신의 덱에서 "대지" 속성 몬스터 1장을 묘지로 보낼 수 있다.' },
  { id: 'm06', name: '바람의 요정', type: 'monster', atk: 1800, def: 1200, image: 'cards/m06.jpg', description: '이 카드가 일반 소환에 성공했을 때, 자신 필드의 모든 마법/함정 카드를 다시 발동할 수 있다.' },
  { id: 'm07', name: '어둠의 사신', type: 'monster', atk: 2000, def: 1500, image: 'cards/m07.jpg', description: '이 카드가 전투로 몬스터를 파괴했을 때, 상대의 묘지의 몬스터 1장을 제외한다.' },
  { id: 'm08', name: '전공의 용', type: 'monster', atk: 2800, def: 2400, image: 'cards/m08.jpg', description: '이 카드가 특수 소환에 성공했을 때, 자신 필드의 모든 몬스터의 공격력은 500 올라간다.' },
  { id: 'm09', name: '지옥의 군주', type: 'monster', atk: 2700, def: 2000, image: 'cards/m09.jpg', description: '이 카드가 소환에 성공했을 때, 상대 필드의 몬스터 1장을 지정하여 공격력을 0으로 한다.' },
  { id: 'm10', name: '달의 늑대', type: 'monster', atk: 2000, def: 1400, image: 'cards/m10.jpg', description: '이 카드가 전투로 몬스터를 파괴했을 때, 자신은 덱에서 1장 드로우한다.' },
  { id: 'm11', name: '번개 사냥꾼', type: 'monster', atk: 2300, def: 1600, image: 'cards/m11.jpg', description: '이 카드가 공격 선언했을 때, 상대 필드의 마법/함정 카드 1장을 선택하여 파괴한다.' },
  { id: 'm12', name: '저주받은 인어', type: 'monster', atk: 1600, def: 1200, image: 'cards/m12.jpg', description: '이 카드가 묘지에 존재할 경우, 자신의 턴에 1번, 몬스터 1장의 효과를 무효로 할 수 있다.' },
  { id: 'm13', name: '시간의 마도사', type: 'monster', atk: 1800, def: 1000, image: 'cards/m13.jpg', description: '이 카드가 소환에 성공했을 때, 자신은 덱에서 1장 드로우한다.' },
  { id: 'm14', name: '죽음의 기사', type: 'monster', atk: 2100, def: 1500, image: 'cards/m14.jpg', description: '이 카드가 전투로 몬스터를 파괴했을 때, 상대의 라이프 포인트를 500 감소시킨다.' },
  { id: 'm15', name: '정령의 드루이드', type: 'monster', atk: 1700, def: 1400, image: 'cards/m15.jpg', description: '이 카드가 소환에 성공했을 때, 자신 필드의 "정령" 몬스터 1장을 특수 소환할 수 있다.' },
  { id: 'm16', name: '용암의 거인', type: 'monster', atk: 2500, def: 2000, image: 'cards/m16.jpg', description: '이 카드가 소환에 성공했을 때, 상대 필드의 몬스터 1장을 선택하여 공격력을 1000 감소시킨다.' },
  { id: 'm17', name: '얼음의 여왕', type: 'monster', atk: 2200, def: 1800, image: 'cards/m17.jpg', description: '이 카드가 특수 소환에 성공했을 때, 상대 필드의 몬스터 전체의 공격력을 500 감소시킨다.' },
  { id: 'm18', name: '광기의 광대', type: 'monster', atk: 1900, def: 1500, image: 'cards/m18.jpg', description: '이 카드가 소환에 성공했을 때, 상대는 패 1장을 묘지로 보내고 덱에서 1장 드로우한다.' },
  { id: 'm19', name: '유령선', type: 'monster', atk: 2300, def: 1800, image: 'cards/m19.jpg', description: '이 카드가 묘지로 보내졌을 때, 자신 필드에 "바다" 속성 몬스터 1장을 특수 소환할 수 있다.' },
  { id: 'm20', name: '하늘을 나는 섬', type: 'monster', atk: 2400, def: 2000, image: 'cards/m20.jpg', description: '이 카드가 소환에 성공했을 때, 자신 필드의 모든 몬스터의 수비력을 500 올린다.' },

  // ---- 마법 ----
  { id: 's01', name: '파이어볼', type: 'spell', effect: 'damage', value: 800, emoji: '🔥', description: '상대에게 800 데미지를 입힌다.' },
  { id: 's02', name: '라이트닝 볼트', type: 'spell', effect: 'damage', value: 800, emoji: '💥', description: '상대에게 800 데미지를 입힌다.' },
  { id: 's03', name: '회복의 빛', type: 'spell', effect: 'heal', value: 800, emoji: '✨', description: '내 라이프를 800 회복한다.' },
  { id: 's04', name: '생명의 샘', type: 'spell', effect: 'heal', value: 800, emoji: '💧', description: '내 라이프를 800 회복한다.' },
  { id: 's05', name: '힘의 축복', type: 'spell', effect: 'buff', value: 500, emoji: '💪', description: '내 몬스터 1장의 공격력을 500 올린다.' },
  { id: 's06', name: '지혜의 서', type: 'spell', effect: 'draw', value: 2, emoji: '📖', description: '카드를 2장 뽑는다.' },
];
