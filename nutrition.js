// =====================================================================
// nutrition.js : "하루에 얼마나 먹어야 하는지" 계산하는 곳
// ---------------------------------------------------------------------
// 앱 화면과 상관없는 순수한 계산만 모아뒀어요. 기준을 바꾸고 싶으면
// 이 파일만 고치면 돼요. (예: 단백질 기준을 체중당 2.0g으로 올리기)
// =====================================================================

// 처음 열었을 때 쓰는 임시 값이에요. 내 실제 정보는 앱의 ⚙ "내 기준" 화면에서 입력하고,
// 폰 안에만 저장돼요. (이 파일은 공개 저장소에 올라가니 여기에 내 정보를 적지 마세요!)
const DEFAULT_PROFILE = {
  sex: "m",          // 남성 "m", 여성 "f"
  age: 25,           // 만 나이
  height: 170,       // 키 (cm)
  weight: null,      // 몸무게 (kg) — 아직 모르면 null. 그동안은 아래 guessWeight 사용
  activity: 1.55,    // 활동량 (아래 ACTIVITY 중 하나)
  goal: "maintain",  // 목표 (아래 GOALS 중 하나)
  proteinPerKg: 1.6, // 몸무게 1kg당 단백질 g. 근력운동 하면 1.6~2.2를 많이 써요
};

// 몸무게를 모를 때 쓰는 값: 키로 계산한 표준 체중 (BMI 22 기준, 예: 1.73 × 1.73 × 22 ≈ 66kg)
const guessWeight = (p) => Math.round(22 * (p.height / 100) ** 2);

const ACTIVITY = [
  { value: 1.2,   label: "거의 운동 안 함" },
  { value: 1.375, label: "주 1~3회 운동" },
  { value: 1.55,  label: "주 3~5회 운동" },
  { value: 1.725, label: "주 6~7회 운동" },
];

const GOALS = {
  cut:      { label: "감량", delta: -400 }, // 하루 400kcal 덜 먹기 → 한 달에 약 1.5kg 감량 페이스
  maintain: { label: "유지", delta: 0 },
  bulk:     { label: "증량", delta: +300 }, // 근육 늘릴 때 살짝만 더 먹기
};

// 화면에 보여줄 영양소 목록.
//  kind: "target" = 이만큼은 먹어야 하는 것(부족하면 알림)
//        "limit"  = 이만큼 넘지 않는 게 좋은 것(넘치면 알림)
const NUTRIENTS = [
  { key: "kcal",    label: "열량",     unit: "kcal", kind: "target" },
  { key: "protein", label: "단백질",   unit: "g",    kind: "target" },
  { key: "carbs",   label: "탄수화물", unit: "g",    kind: "target" },
  { key: "fat",     label: "지방",     unit: "g",    kind: "target" },
  { key: "fiber",   label: "식이섬유", unit: "g",    kind: "target" },
  { key: "sugar",   label: "당류",     unit: "g",    kind: "limit"  },
  { key: "sodium",  label: "나트륨",   unit: "mg",   kind: "limit"  },
];

// 내 정보로 하루 목표를 계산해요.
function calcTargets(p) {
  const weight = p.weight || guessWeight(p);

  // 1) 기초대사량(BMR): 가만히 있어도 쓰는 열량. Mifflin-St Jeor 공식
  //    남성: 10×몸무게 + 6.25×키 − 5×나이 + 5
  const bmr = 10 * weight + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5);

  // 2) 활동량을 곱하면 하루에 실제로 쓰는 열량(TDEE)
  const tdee = bmr * p.activity;

  // 3) 목표(감량/유지/증량)에 따라 더하거나 빼고, 10 단위로 반올림
  const kcal = Math.round((tdee + GOALS[p.goal].delta) / 10) * 10;

  // 4) 단백질은 몸무게 기준, 지방은 열량의 25%, 나머지 열량을 탄수화물로
  //    (단백질·탄수화물 1g = 4kcal, 지방 1g = 9kcal)
  const protein = Math.round(weight * p.proteinPerKg);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return {
    kcal, protein, carbs, fat,
    fiber: p.sex === "f" ? 20 : 30,         // 한국인 영양소 섭취기준(19~29세) 충분섭취량
    sugar: Math.round((kcal * 0.2) / 4),     // 총당류는 열량의 20% 이하 (한국인 영양소 섭취기준)
    sodium: 2300,                            // 만성질환 위험을 줄이는 섭취량 2,300mg 이하
    bmr: Math.round(bmr), tdee: Math.round(tdee), weightUsed: weight,
  };
}

// 부족할 때 추천해줄 음식 (foods.js에 있는 이름과 똑같이 써야 해요)
const SUGGEST = {
  protein: ["닭가슴살(익힌 것)", "그릭요거트(플레인)", "삶은 달걀", "두부"],
  carbs:   ["현미밥", "고구마(찐 것)", "바나나"],
  fat:     ["아몬드", "아보카도", "땅콩버터"],
  fiber:   ["브로콜리(데친 것)", "사과", "고구마(찐 것)"],
};
