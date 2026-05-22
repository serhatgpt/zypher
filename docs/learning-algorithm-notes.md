# Zypher Learning Algorithm Notes

## Kısa karar

Zypher için en mantıklı MVP algoritması “FSRS-lite + multi-skill retrieval” olmalı:

1. Kullanıcı kelime/phrase ekler.
2. AI learning card üretir: anlam, örnekler, common mistakes.
3. Sistem 4 görev üretir: speaking, reading, writing, review.
4. Her pratikten sonra kullanıcı kelimeyi gerçekten hatırladı mı / üretti mi / hata yaptı mı ölçülür.
5. Mastery ve tekrar günü güncellenir.

Bu, SaaS gibi karmaşık değil ama pedagojik olarak doğru bir çekirdek.

## Neden böyle?

### 1. Spaced repetition gerekli ama tek başına yetmez

Dil sadece flashcard ezberi değil. Yine de kelime ve phrase retention için dağıtılmış tekrar çok güçlüdür. FSRS gibi modern scheduler’lar memory state’i kabaca üç değişkenle düşünür: difficulty, stability, retrievability.

Zypher MVP’de tam FSRS implement etmek yerine şu alanları tutmak yeterli:

- mastery_score: 0-100
- difficulty: 1-5 veya kolay/orta/zor
- last_seen_at
- next_review_at
- review_count
- lapse_count

Kaynak referansı:
- Open Spaced Repetition / FSRS: https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler

### 2. Retrieval practice ana motor olmalı

Kullanıcı kelimeyi pasif görmesin; üretmeye zorlanmalı:

- Speaking: canlı konuşmada kullan
- Writing: kendi hayatından 2-3 cümle yaz
- Reading: kısa context içinde fark et ve anlamı çıkar
- Review: birkaç gün sonra tekrar üret

Sadece “tanıdım” değil, “kullandım” skorlanmalı.

### 3. Comprehensible input + pushed output birlikte olmalı

Zypher’ın farkı voice-first olduğu için sadece input vermek zayıf kalır. İyi loop:

- Input: kısa, seviyeye uygun paragraph/dialogue
- Output: kullanıcıdan cümle/konuşma üretimi
- Feedback: yanlış, eksik, doğal alternatif
- Retry: aynı kelimeyi yeni bağlamda yeniden kullan

### 4. Interleaving eklenmeli ama basit

Aynı kelimeyi 10 kere üst üste değil; 2-3 eski kelimeyle karıştırmak daha iyi:

Bugünkü görev:
- 1 yeni kelime
- 1 zayıf eski kelime
- 1 due review kelimesi

Bu öğrenmeyi gerçek konuşmaya yaklaştırır.

## Basit skor kuralı

Her kelime için pratik sonrası:

- Kullanıcı hedef kelimeyi doğru kullandı: +12
- Doğru kullandı ama grammar/fluency hatası var: +6
- Hedef kelimeyi hiç kullanmadı: -8
- Yanlış anlamda kullandı: -12
- Aynı hatayı tekrar yaptı: difficulty +1
- Üst üste 2 başarılı kullanım: next_review_at daha ileri

Review aralıkları:

- mastery < 35: yarın
- 35-55: 3 gün sonra
- 55-75: 7 gün sonra
- 75+: 14 gün sonra

## Zypher’da şu eklenmeli

### Hemen eklenmeli

1. Roadmap item completion
- Görev tamamlanınca status=completed.
- Open roadmap sadece açık görevleri göstermeli.

2. Due review mantığı
- Her kelimenin next_review_at değeri gerçek tarih olmalı.
- Dashboard “bugün çalışılacaklar”ı buradan seçmeli.

3. Mistake taxonomy
Mistake alanı düz string yerine şu shape’e yaklaşmalı:

```json
{
  "type": "grammar|vocab_usage|pronunciation|fluency|word_order",
  "text": "wrong connector",
  "suggestion": "Use although at the beginning or middle of a contrast sentence"
}
```

4. AI feedback writing/reading için de çalışmalı
Gemini Live konuşma için kalsın. OpenAI şu işleri yapsın:
- writing feedback
- reading comprehension feedback
- next roadmap generation
- mistake taxonomy

### Şimdilik eklemeyelim

- Duolingo tarzı büyük gamification
- Çok detaylı lesson tree
- Class/course admin panel
- Full SaaS billing/teams
- Ağır analytics dashboard

Bunlar MVP’yi şişirir.

## Product olarak mantıklı olmayan yerler / dikkat

1. localStorage + DB karışımı geçici kalmalı
Şu an demo için iyi ama login olan kullanıcıda DB ana kaynak olmalı. Local sadece offline/fallback.

2. Token localStorage’da duruyor
MVP için kabul edilebilir ama ileride HTTP-only cookie daha doğru.

3. SQLite Cloud Run’da kalıcı olmayabilir
Local/dev için iyi. Production’da Cloud Run container filesystem kalıcı değil. İlk production için ya persistent volume ya da managed DB gerekir. “SaaS karmaşık olmasın” diyorsak SQLite local/demo, production için küçük Postgres/Cloud SQL sonra.

4. Mastery sadece score ile değil, “hedef kelime kullanıldı mı” ile güncellenmeli
Sadece konuşma skoru yanıltır. Kullanıcı iyi konuşup hedef kelimeyi kullanmayabilir.

## MVP algoritması özeti

Her gün:

1. due words seç: next_review_at <= today
2. yeni kelime varsa ekle
3. görev paketi üret:
   - speaking roleplay
   - reading context
   - writing output
   - delayed review
4. pratik sonrası:
   - used/missed words
   - mistake types
   - score
   - next_practice
5. mastery + next_review_at güncelle

Bu Zypher’ı “AI chat app” olmaktan çıkarıp gerçek öğrenme sistemine dönüştürür.
