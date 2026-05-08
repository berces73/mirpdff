/**
 * tool-content.js — MirPDF Tool Sayfası İçerik Enjektörü
 * Her tool sayfasına: Nasıl Kullanılır + Özellikler + SSS + İlgili Araçlar inject eder
 */

const TOOL_DATA = {
  sikistir: {
    title: "PDF Sıkıştırma",
    icon: "fa-compress-alt",
    color: "#6366f1",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Dosyanızı sürükleyip bırakın ya da bilgisayarınızdan seçin. Maks 50 MB." },
      { icon: "fa-sliders-h", title: "Kalite Seçin", desc: "Web, baskı veya maksimum sıkıştırma seçeneklerinden birini belirleyin." },
      { icon: "fa-download", title: "İndirin", desc: "Küçültülmüş PDF saniyeler içinde hazır. Orijinal dosyanız değişmez." }
    ],
    features: [
      { icon: "fa-shield-alt", title: "Güvenli İşlem", desc: "Dosyanız tarayıcınızda işlenir, sunucuya gönderilmez." },
      { icon: "fa-tachometer-alt", title: "Akıllı Sıkıştırma", desc: "Kaliteyi koruyarak dosya boyutunu %70'e kadar düşürür." },
      { icon: "fa-file-pdf", title: "Orijinal Korunur", desc: "Sıkıştırma işlemi orijinal dosyanıza dokunmaz." },
      { icon: "fa-mobile-alt", title: "Tüm Cihazlarda", desc: "Masaüstü, tablet ve mobilde aynı hızda çalışır." }
    ],
    faq: [
      { q: "Dosyam sunucuya gönderiliyor mu?", a: "Hayır. İşlem tamamen tarayıcınızda gerçekleşir. Dosyanız hiçbir sunucuya yüklenmez." },
      { q: "Maksimum dosya boyutu nedir?", a: "Ücretsiz kullanımda 50 MB. Pro plan ile 200 MB'a kadar dosya işleyebilirsiniz." },
      { q: "Kalite kaybı olur mu?", a: "Web kalitesi seçeneğinde görsel kalite korunarak boyut %60-70 küçülür. Maksimum sıkıştırmada görsel kalite biraz düşebilir." },
      { q: "Sıkıştırılmış PDF'i yazdırabilir miyim?", a: "Evet. 'Baskı' kalite seçeneği yazdırma için optimize edilmiştir." }
    ],
    related: ["birlestir","bol","pdf-to-word","koruma"]
  },
  birlestir: {
    title: "PDF Birleştirme",
    icon: "fa-object-group",
    color: "#0ea5e9",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "Dosyaları Yükleyin", desc: "Birleştirmek istediğiniz PDF dosyalarını seçin veya sürükleyin." },
      { icon: "fa-sort", title: "Sıraya Dizin", desc: "Dosyaları istediğiniz sıraya sürükleyerek düzenleyin." },
      { icon: "fa-download", title: "Birleştirin & İndirin", desc: "Tek tıkla tüm dosyaları birleştirin ve yeni PDF'i indirin." }
    ],
    features: [
      { icon: "fa-layer-group", title: "Çoklu Dosya", desc: "Aynı anda istediğiniz kadar PDF dosyasını birleştirebilirsiniz." },
      { icon: "fa-sort-amount-down", title: "Sıralamalı Birleştirme", desc: "Sayfaların sırasını istediğiniz gibi ayarlayın." },
      { icon: "fa-shield-alt", title: "Gizli & Güvenli", desc: "Tarayıcıda işlenir, dosyalarınız dışarı çıkmaz." },
      { icon: "fa-bolt", title: "Anında Sonuç", desc: "Saniyeler içinde birleştirilmiş PDF hazır." }
    ],
    faq: [
      { q: "Kaç dosyayı birleştirebilirim?", a: "Ücretsiz planda en fazla 5 dosya. Pro planda sınırsız." },
      { q: "Şifreli PDF'leri birleştirebilir miyim?", a: "Şifreli PDF'leri önce 'PDF Kilit Aç' aracıyla açmanız gerekir, ardından birleştirebilirsiniz." },
      { q: "Sayfa sırası bozulur mu?", a: "Hayır. Her dosyanın sayfaları kendi orijinal sırasıyla eklenir." },
      { q: "Dosya boyutu sınırı var mı?", a: "Her dosya için maks 50 MB (Pro: 200 MB)." }
    ],
    related: ["bol","ayikla","sirala","sikistir"]
  },
  bol: {
    title: "PDF Bölme",
    icon: "fa-cut",
    color: "#f59e0b",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Bölmek istediğiniz PDF dosyasını yükleyin." },
      { icon: "fa-scissors", title: "Bölme Yöntemini Seçin", desc: "Her sayfayı ayrı, sayfa aralığına göre ya da boyut limitine göre bölebilirsiniz." },
      { icon: "fa-download", title: "İndirin", desc: "Bölünmüş dosyalar ZIP olarak paketlenir ve indirilir." }
    ],
    features: [
      { icon: "fa-th-list", title: "Esnek Bölme", desc: "Her sayfayı ayrı dosya yapın ya da istediğiniz aralıkları belirleyin." },
      { icon: "fa-file-archive", title: "ZIP İndirme", desc: "Tüm parçalar tek bir ZIP dosyasına paketlenir." },
      { icon: "fa-shield-alt", title: "Orijinal Dosya Korunur", desc: "Orijinal PDF'niz değişmeden kalır." },
      { icon: "fa-bolt", title: "Hızlı İşlem", desc: "100 sayfalık belgeyi 10 saniyede böler." }
    ],
    faq: [
      { q: "Her sayfayı ayrı dosya yapabilir miyim?", a: "Evet. 'Her sayfayı ayrı böl' seçeneğiyle her sayfa ayrı bir PDF olur." },
      { q: "Sayfa aralığı nasıl belirtirim?", a: "'1-5, 6-10' gibi virgülle ayrılmış aralıklar kullanabilirsiniz." },
      { q: "Bölünmüş dosyalar nasıl geliyor?", a: "Birden fazla parça varsa ZIP olarak, tek parça ise direkt PDF olarak indirilir." },
      { q: "Maksimum sayfa sınırı nedir?", a: "Tarayıcıda işlendiği için pratik sınır RAM'inizle belirlenir. Genellikle 500 sayfa sorunsuz çalışır." }
    ],
    related: ["birlestir","ayikla","sirala","sikistir"]
  },
  ayikla: {
    title: "PDF Sayfa Ayıklama",
    icon: "fa-file-export",
    color: "#8b5cf6",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Sayfalarını ayıklamak istediğiniz PDF'i sürükleyin veya seçin." },
      { icon: "fa-hand-pointer", title: "Sayfaları Seçin", desc: "Chip'lere tıklayın veya '1,3,5-8' gibi aralık girin." },
      { icon: "fa-download", title: "Yeni PDF İndirin", desc: "Seçili sayfalardan oluşan yeni PDF oluşturulur ve indirilir." }
    ],
    features: [
      { icon: "fa-mouse-pointer", title: "Görsel Seçim", desc: "Sayfa chip'lerine tıklayarak kolayca seçim yapın." },
      { icon: "fa-text-width", title: "Aralık Girişi", desc: "'1,3,5-8' formatında sayfa aralığı belirtebilirsiniz." },
      { icon: "fa-file-pdf", title: "Orijinal Korunur", desc: "Kaynak dosyanıza dokunulmaz, yeni bir PDF oluşturulur." },
      { icon: "fa-shield-alt", title: "Tarayıcıda İşlem", desc: "Tüm işlem cihazınızda gerçekleşir." }
    ],
    faq: [
      { q: "PDF Böl aracından farkı nedir?", a: "PDF Böl belgeyi birden fazla dosyaya böler. Sayfa Ayıkla ise belirlediğiniz sayfaları tek yeni PDF olarak çıkarır." },
      { q: "Orijinal dosyam değişir mi?", a: "Hayır. İşlem yeni bir PDF oluşturur, orijinaliniz değişmez." },
      { q: "Aralık nasıl belirtilir?", a: "'1,3,5-8' gibi virgülle ayrılmış numaralar veya tire ile aralık girin." },
      { q: "Tüm sayfaları seçebilir miyim?", a: "Evet, sayfa alanını boş bırakırsanız tüm sayfalar kopyalanır." }
    ],
    related: ["bol","birlestir","sirala","sikistir"]
  },
  rotate: {
    title: "PDF Döndürme",
    icon: "fa-redo",
    color: "#ec4899",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Döndürmek istediğiniz PDF'i yükleyin." },
      { icon: "fa-redo", title: "Dönüş Yönünü Seçin", desc: "Saat yönünde, saat yönü tersine veya 180° döndürme seçenekleri mevcuttur." },
      { icon: "fa-download", title: "İndirin", desc: "Döndürülmüş PDF saniyeler içinde hazır." }
    ],
    features: [
      { icon: "fa-redo-alt", title: "3 Yön Seçeneği", desc: "90°, 180° veya 270° döndürme." },
      { icon: "fa-object-group", title: "Seçili Sayfalar", desc: "Tüm PDF'yi veya sadece belirli sayfaları döndürün." },
      { icon: "fa-shield-alt", title: "Kalite Korunur", desc: "Döndürme işlemi PDF kalitesini etkilemez." },
      { icon: "fa-bolt", title: "Anında", desc: "İşlem birkaç saniye içinde tamamlanır." }
    ],
    faq: [
      { q: "Tek sayfayı mı yoksa tamamını mı döndürebilirim?", a: "Her ikisi de mümkün. Tüm sayfaları veya belirli sayfa aralıklarını döndürebilirsiniz." },
      { q: "Döndürme geri alınabilir mi?", a: "Orijinal dosya değişmediği için istediğiniz zaman tekrar döndürebilirsiniz." },
      { q: "Metin yönü de değişiyor mu?", a: "Evet, metin dahil tüm sayfa içeriği döndürülür." },
      { q: "Şifreli PDF döndürebilir miyim?", a: "Önce şifreyi 'PDF Kilit Aç' aracıyla kaldırmanız gerekir." }
    ],
    related: ["birlestir","bol","ayikla","sirala"]
  },
  sirala: {
    title: "Sayfa Sıralama",
    icon: "fa-sort",
    color: "#14b8a6",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Sayfalarını yeniden düzenlemek istediğiniz PDF'i yükleyin." },
      { icon: "fa-arrows-alt", title: "Sürükle & Bırak", desc: "Sayfa küçük resimlerine tıklayıp sürükleyerek sırayı değiştirin." },
      { icon: "fa-download", title: "Kaydedin", desc: "Yeni sırayla kaydedilmiş PDF'i indirin." }
    ],
    features: [
      { icon: "fa-th", title: "Görsel Önizleme", desc: "Her sayfanın küçük resmi görüntülenir." },
      { icon: "fa-mouse-pointer", title: "Sürükle & Bırak", desc: "Sayfaları kolayca sürükleyerek yeniden sıralayın." },
      { icon: "fa-trash-alt", title: "Sayfa Silme", desc: "Sıralama sırasında istemediğiniz sayfaları kaldırın." },
      { icon: "fa-shield-alt", title: "Tarayıcıda İşlem", desc: "Tüm işlem cihazınızda gerçekleşir." }
    ],
    faq: [
      { q: "Kaç sayfaya kadar düzenleyebilirim?", a: "Tarayıcıda çalıştığından pratik sınır RAM'inizle belirlenir. 100 sayfa sorunsuz işlenir." },
      { q: "Sayfaları silebilir miyim?", a: "Evet, sıralama arayüzünden sayfaları kaldırabilirsiniz." },
      { q: "Orijinal dosya değişiyor mu?", a: "Hayır, yeni düzende ayrı bir PDF oluşturulur." },
      { q: "Küçük resimler neden yüklenmiyor?", a: "PDF.js kütüphanesi yükleniyor olabilir. Birkaç saniye bekleyin." }
    ],
    related: ["birlestir","bol","ayikla","rotate"]
  },
  kilitle: {
    title: "PDF Şifreleme",
    icon: "fa-lock",
    color: "#ef4444",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Şifrelemek istediğiniz PDF'i yükleyin." },
      { icon: "fa-key", title: "Şifre Belirleyin", desc: "Güçlü bir şifre girin. Unutursanız kurtarma imkânı yoktur." },
      { icon: "fa-download", title: "Şifreli PDF İndirin", desc: "Şifrelenmiş PDF indirilir. Açmak için şifre gerekir." }
    ],
    features: [
      { icon: "fa-shield-alt", title: "AES-128 Şifreleme", desc: "Endüstri standardı şifreleme algoritması kullanılır." },
      { icon: "fa-user-lock", title: "Açma Şifresi", desc: "PDF'i açmak için şifre zorunlu hâle gelir." },
      { icon: "fa-print", title: "İzin Kontrolü", desc: "Yazdırma ve kopyalamayı ayrıca kısıtlayabilirsiniz." },
      { icon: "fa-bolt", title: "Anlık İşlem", desc: "Saniyeler içinde şifreli PDF hazır." }
    ],
    faq: [
      { q: "Şifremi unutursam ne olur?", a: "Şifreler kurtarılamaz. Lütfen güvenli bir yerde saklayın." },
      { q: "Hangi şifreleme kullanılıyor?", a: "PDF standardı olan AES-128 bit şifreleme kullanılır." },
      { q: "Şifreli PDF her programda açılır mı?", a: "Evet, Adobe Acrobat, Foxit gibi tüm PDF görüntüleyicilerinde şifre girilerek açılır." },
      { q: "Şifre kaldırılabilir mi?", a: "Evet, 'PDF Kilit Aç' aracımızı kullanabilirsiniz." }
    ],
    related: ["kilit-ac","filigran","birlestir","sikistir"]
  },
  "kilit-ac": {
    title: "PDF Şifre Kaldırma",
    icon: "fa-lock-open",
    color: "#10b981",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "Şifreli PDF Yükleyin", desc: "Kilidini açmak istediğiniz PDF'i yükleyin." },
      { icon: "fa-key", title: "Şifreyi Girin", desc: "PDF'in şifresini girin." },
      { icon: "fa-download", title: "Kilitsiz PDF İndirin", desc: "Şifresi kaldırılmış PDF hazır." }
    ],
    features: [
      { icon: "fa-shield-alt", title: "Güvenli İşlem", desc: "Şifreniz sunucuya gönderilmez, tarayıcıda işlenir." },
      { icon: "fa-file-pdf", title: "Tam Uyumluluk", desc: "Tüm PDF şifreleme standartlarını destekler." },
      { icon: "fa-bolt", title: "Anında", desc: "Doğru şifreyi girince PDF anında açılır." },
      { icon: "fa-print", title: "Kısıtlamalar Kaldırılır", desc: "Yazdırma ve kopyalama kısıtlamaları da kaldırılır." }
    ],
    faq: [
      { q: "Şifremi bilmiyorum, açabilir miyim?", a: "Hayır. Bu araç yalnızca bilinen şifreyle PDF'in korumasını kaldırır." },
      { q: "Şifrem nereye gönderiliyor?", a: "Hiçbir yere. Tüm işlem tarayıcınızda gerçekleşir." },
      { q: "Açılan PDF'te hangi kısıtlamalar kaldırılır?", a: "Açma şifresi, yazdırma ve kopyalama kısıtlamaları kaldırılır." },
      { q: "İşe yaramadı, ne yapayım?", a: "PDF farklı bir şifreleme yöntemi kullanıyor olabilir. Adobe Acrobat ile deneyin." }
    ],
    related: ["kilitle","filigran","birlestir","sikistir"]
  },
  "pdf-to-word": {
    title: "PDF'den Word'e Dönüştürme",
    icon: "fa-file-word",
    color: "#2563eb",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Word'e dönüştürmek istediğiniz PDF dosyasını yükleyin." },
      { icon: "fa-cog", title: "Dönüştürme Başlasın", desc: "Sunucuda LibreOffice ile yüksek kaliteli dönüştürme yapılır." },
      { icon: "fa-download", title: ".docx İndirin", desc: "Düzenlenebilir Word belgesi indirilir." }
    ],
    features: [
      { icon: "fa-file-word", title: "Yüksek Kalite", desc: "LibreOffice motoru ile tablo, başlık ve görseller korunur." },
      { icon: "fa-table", title: "Tablo Desteği", desc: "PDF'deki tablolar Word formatında düzenlenebilir gelir." },
      { icon: "fa-text-height", title: "Metin Tanıma", desc: "Metin, paragraf yapısı ve yazı biçimleri aktarılır." },
      { icon: "fa-bolt", title: "Hızlı Dönüştürme", desc: "Ortalama 30 saniyede tamamlanır." }
    ],
    faq: [
      { q: "Taranmış PDF'i Word'e çevirebilir miyim?", a: "Taranmış PDF'ler için önce OCR aracımızı kullanmanız gerekir." },
      { q: "Formatlar bozulur mu?", a: "Basit belgeler çok iyi aktarılır. Karmaşık düzenlerde küçük farklılıklar olabilir." },
      { q: "Dosya boyutu sınırı?", a: "Ücretsiz: 50 MB. Pro: 200 MB." },
      { q: "Hangi dilleri destekliyor?", a: "Tüm Latin karakterli dilleri ve Türkçe'yi destekler." }
    ],
    related: ["ocr","word-to-pdf","sikistir","birlestir"]
  },
  "word-to-pdf": {
    title: "Word'den PDF'e Dönüştürme",
    icon: "fa-file-pdf",
    color: "#dc2626",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "Word Dosyası Yükleyin", desc: ".docx veya .doc dosyanızı yükleyin." },
      { icon: "fa-cog", title: "Otomatik Dönüştürme", desc: "LibreOffice ile yüksek kaliteli PDF oluşturulur." },
      { icon: "fa-download", title: "PDF İndirin", desc: "Profesyonel görünümlü PDF hazır." }
    ],
    features: [
      { icon: "fa-file-word", title: ".docx & .doc", desc: "Her iki Word formatını destekler." },
      { icon: "fa-paint-brush", title: "Format Korunur", desc: "Fontlar, tablolar ve görseller PDF'te aynı görünür." },
      { icon: "fa-print", title: "Baskıya Hazır", desc: "Oluşturulan PDF doğrudan yazdırmaya uygundur." },
      { icon: "fa-bolt", title: "Hızlı", desc: "Çoğu belge 20 saniyeden kısada dönüştürülür." }
    ],
    faq: [
      { q: ".doc formatı destekleniyor mu?", a: "Evet, hem .docx hem .doc desteklenir." },
      { q: "Fontlarım görünecek mi?", a: "Yaygın fontlar sorunsuz aktarılır. Özel fontlar için PDF'e göm seçeneği önerilir." },
      { q: "Dosya boyutu sınırı?", a: "Ücretsiz: 50 MB. Pro: 200 MB." },
      { q: "Tablolar bozulur mu?", a: "Basit tablolar sorunsuz. Karmaşık tablolarda küçük kaymalar olabilir." }
    ],
    related: ["pdf-to-word","excel-to-pdf","ppt-to-pdf","sikistir"]
  },
  "excel-to-pdf": {
    title: "Excel'den PDF'e Dönüştürme",
    icon: "fa-file-excel",
    color: "#16a34a",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "Excel Dosyası Yükleyin", desc: ".xlsx veya .xls dosyanızı yükleyin." },
      { icon: "fa-cog", title: "Otomatik Dönüştürme", desc: "Tüm sayfalar ve grafikler korunarak PDF oluşturulur." },
      { icon: "fa-download", title: "PDF İndirin", desc: "Paylaşıma hazır PDF dosyanız hazır." }
    ],
    features: [
      { icon: "fa-table", title: "Tablo & Grafik", desc: "Tüm hücreler, formüller ve grafikler korunur." },
      { icon: "fa-layer-group", title: "Çoklu Sayfa", desc: "Tüm Excel sekmeleri ayrı PDF sayfaları olarak gelir." },
      { icon: "fa-print", title: "Baskıya Hazır", desc: "A4 veya özel sayfa boyutunda oluşturulur." },
      { icon: "fa-bolt", title: "Hızlı İşlem", desc: "LibreOffice ile sunucu tarafında işlenir." }
    ],
    faq: [
      { q: ".xls formatı destekleniyor mu?", a: "Evet, hem .xlsx hem .xls desteklenir." },
      { q: "Grafikler PDF'te görünüyor mu?", a: "Evet, tüm grafikler PDF'te görsel olarak korunur." },
      { q: "Formüller hesaplanmış mı gelir?", a: "Evet, formüller hesaplanmış değerleriyle PDF'e aktarılır." },
      { q: "Çok sayfalı Excel'i nasıl işliyor?", a: "Her sekme ayrı bir PDF sayfası olarak gelir." }
    ],
    related: ["word-to-pdf","ppt-to-pdf","pdf-to-word","sikistir"]
  },
  "ppt-to-pdf": {
    title: "PowerPoint'ten PDF'e Dönüştürme",
    icon: "fa-file-powerpoint",
    color: "#ea580c",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PPT/PPTX Yükleyin", desc: "Sunumunuzu sürükleyin veya seçin." },
      { icon: "fa-cog", title: "Otomatik Dönüştürme", desc: "Her slayt ayrı PDF sayfası olarak oluşturulur." },
      { icon: "fa-download", title: "PDF İndirin", desc: "Slaytlarınız PDF formatında hazır." }
    ],
    features: [
      { icon: "fa-images", title: "Slayt Korunur", desc: "Görseller, animasyonlar ve düzen korunur." },
      { icon: "fa-layer-group", title: "Tüm Slaytlar", desc: "Her slayt ayrı bir PDF sayfası olarak aktarılır." },
      { icon: "fa-paint-brush", title: "Renkler & Fontlar", desc: "Sunum renkleri ve yazı tipleri PDF'te aynı görünür." },
      { icon: "fa-bolt", title: "Hızlı Dönüştürme", desc: "LibreOffice motoru ile saniyeler içinde tamamlanır." }
    ],
    faq: [
      { q: ".ppt formatı destekleniyor mu?", a: "Evet, hem .pptx hem .ppt desteklenir." },
      { q: "Animasyonlar PDF'te görünüyor mu?", a: "Hayır, PDF statik format olduğundan animasyonlar ilk kare olarak aktarılır." },
      { q: "Konuşmacı notları geliyor mu?", a: "Hayır, yalnızca slayt içeriği aktarılır." },
      { q: "Dosya boyutu sınırı?", a: "Ücretsiz: 50 MB. Pro: 200 MB." }
    ],
    related: ["word-to-pdf","excel-to-pdf","pdf-to-word","sikistir"]
  },
  ocr: {
    title: "OCR — Taranmış PDF'ten Metin",
    icon: "fa-eye",
    color: "#7c3aed",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "Taranmış PDF Yükleyin", desc: "Metni seçilemeyen taranmış veya resim tabanlı PDF'i yükleyin." },
      { icon: "fa-cog", title: "OCR İşlemi", desc: "Tesseract motoru ile metin tanıma yapılır." },
      { icon: "fa-download", title: "Aranabilir PDF İndirin", desc: "Metni seçilebilir, kopyalanabilir ve aranabilir PDF hazır." }
    ],
    features: [
      { icon: "fa-language", title: "Türkçe Desteği", desc: "Türkçe karakter tanıma için özel optimize edilmiştir." },
      { icon: "fa-search", title: "Aranabilir PDF", desc: "OCR sonrası PDF'te metin arama yapılabilir." },
      { icon: "fa-copy", title: "Kopyalanabilir Metin", desc: "İçeriği kopyalayıp başka belgelere yapıştırın." },
      { icon: "fa-file-alt", title: "Metin Çıktısı", desc: "Düz metin olarak da dışa aktarabilirsiniz." }
    ],
    faq: [
      { q: "Hangi dilleri destekliyor?", a: "Türkçe başta olmak üzere 50+ dili destekler." },
      { q: "Tarama kalitesi önemli mi?", a: "Evet. 300 DPI ve üzeri taramalar çok daha iyi sonuç verir." },
      { q: "El yazısını tanıyor mu?", a: "Baskı metinler için optimize edilmiştir. El yazısı sınırlı desteklenir." },
      { q: "Dosya boyutu sınırı?", a: "Ücretsiz: 50 MB, 10 sayfa. Pro: 200 MB, sınırsız sayfa." }
    ],
    related: ["pdf-to-word","sikistir","birlestir","ayikla"]
  },
  filigran: {
    title: "PDF Filigran Ekleme",
    icon: "fa-stamp",
    color: "#0891b2",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Filigran eklemek istediğiniz PDF'i yükleyin." },
      { icon: "fa-font", title: "Filigran Yazısı Girin", desc: "Metin, opaklık ve konumu ayarlayın." },
      { icon: "fa-download", title: "Filigranılı PDF İndirin", desc: "Tüm sayfalarında filigran olan PDF hazır." }
    ],
    features: [
      { icon: "fa-font", title: "Özelleştirilebilir Metin", desc: "Font, boyut, renk ve opaklığı ayarlayın." },
      { icon: "fa-compass", title: "Konum Seçimi", desc: "Merkez, köşe veya özel konuma yerleştirin." },
      { icon: "fa-layer-group", title: "Tüm Sayfalara", desc: "Filigran tüm sayfalara otomatik uygulanır." },
      { icon: "fa-shield-alt", title: "Gizli & Güvenli", desc: "Tarayıcıda işlenir, dosya dışarı çıkmaz." }
    ],
    faq: [
      { q: "Görsel filigran ekleyebilir miyim?", a: "Şu an metin filigranı desteklenmektedir. Logo filigranı Pro planda geliyor." },
      { q: "Filigranı sonradan kaldırabilir miyim?", a: "Hayır, filigran PDF'e kalıcı olarak işlenir." },
      { q: "Hangi sayfaları seçebilirim?", a: "Tüm sayfalar veya belirli sayfa aralığı seçilebilir." },
      { q: "Opaklığı nasıl ayarlıyorum?", a: "Kaydırıcı ile %10 ile %100 arasında opaklık seçebilirsiniz." }
    ],
    related: ["kilitle","qr","birlestir","sikistir"]
  },
  qr: {
    title: "PDF'e QR Kod Ekleme",
    icon: "fa-qrcode",
    color: "#1f2937",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "QR kod eklemek istediğiniz PDF'i yükleyin." },
      { icon: "fa-link", title: "QR İçeriği Girin", desc: "URL, metin veya iletişim bilgisi girin." },
      { icon: "fa-download", title: "PDF İndirin", desc: "QR kodlu PDF hazır." }
    ],
    features: [
      { icon: "fa-qrcode", title: "Yüksek Çözünürlük", desc: "Her boyutta net okunan QR kod oluşturulur." },
      { icon: "fa-expand-arrows-alt", title: "Boyut & Konum", desc: "QR boyutunu ve sayfadaki konumunu ayarlayın." },
      { icon: "fa-layer-group", title: "Seçili Sayfalar", desc: "İlk sayfa, tüm sayfalar veya belirli sayfaları seçin." },
      { icon: "fa-link", title: "URL Desteği", desc: "Web sitesi, e-posta, telefon gibi içerikler desteklenir." }
    ],
    faq: [
      { q: "QR kod her boyutta okunuyor mu?", a: "Evet, yüksek hata düzeltme seviyesiyle oluşturulur." },
      { q: "Hangi içerikleri QR'a ekleyebilirim?", a: "URL, düz metin, e-posta ve telefon numarası desteklenir." },
      { q: "QR kodu sonradan değiştirebilir miyim?", a: "Hayır, PDF'e kalıcı olarak işlenir." },
      { q: "Tüm sayfalara mı ekleniyor?", a: "Seçiminize göre ilk sayfa, son sayfa veya tüm sayfalara ekleyebilirsiniz." }
    ],
    related: ["filigran","kilitle","birlestir","sikistir"]
  },
  "jpg-to-pdf": {
    title: "JPG'den PDF'e Dönüştürme",
    icon: "fa-image",
    color: "#f59e0b",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "Görselleri Yükleyin", desc: "JPG, PNG veya WEBP dosyalarınızı yükleyin." },
      { icon: "fa-sort", title: "Sıralayın", desc: "Görsellerin PDF'teki sırasını düzenleyin." },
      { icon: "fa-download", title: "PDF İndirin", desc: "Tüm görseller tek PDF'de birleştirilir." }
    ],
    features: [
      { icon: "fa-images", title: "Çoklu Görsel", desc: "Birden fazla görseli tek PDF'de birleştirin." },
      { icon: "fa-expand", title: "A4 Uyumu", desc: "Görseller otomatik A4 sayfasına sığdırılır." },
      { icon: "fa-sort", title: "Sıra Ayarı", desc: "PDF'teki sayfa sırası sürükle-bırak ile belirlenir." },
      { icon: "fa-shield-alt", title: "Tarayıcıda İşlem", desc: "Tüm işlem cihazınızda gerçekleşir." }
    ],
    faq: [
      { q: "PNG ve WEBP destekleniyor mu?", a: "Evet, JPG, PNG ve WEBP formatları desteklenir." },
      { q: "Kaç görsel yükleyebilirim?", a: "Ücretsiz planda 20, Pro planda sınırsız." },
      { q: "Görsel kalitesi korunuyor mu?", a: "Evet, görseller sıkıştırılmadan PDF'e eklenir." },
      { q: "Maksimum dosya boyutu?", a: "Her görsel için maks 20 MB." }
    ],
    related: ["pdf-to-jpg","birlestir","sikistir","filigran"]
  },
  "pdf-to-jpg": {
    title: "PDF'den JPG'ye Dönüştürme",
    icon: "fa-file-image",
    color: "#d97706",
    steps: [
      { icon: "fa-cloud-upload-alt", title: "PDF Yükleyin", desc: "Görüntüye çevirmek istediğiniz PDF'i yükleyin." },
      { icon: "fa-sliders-h", title: "Kalite Seçin", desc: "Görüntü kalitesi ve çözünürlüğü ayarlayın." },
      { icon: "fa-download", title: "Görselleri İndirin", desc: "Her sayfa ayrı JPG olarak ZIP'e paketlenir." }
    ],
    features: [
      { icon: "fa-star", title: "Yüksek Çözünürlük", desc: "300 DPI'ye kadar kaliteli görüntü oluşturulur." },
      { icon: "fa-file-archive", title: "ZIP İndirme", desc: "Tüm sayfalar tek ZIP dosyasında." },
      { icon: "fa-object-group", title: "Sayfa Seçimi", desc: "Tüm sayfalar veya belirli sayfaları dönüştürün." },
      { icon: "fa-shield-alt", title: "Tarayıcıda İşlem", desc: "Dosyalar sunucuya gönderilmez." }
    ],
    faq: [
      { q: "Her sayfa ayrı JPG mi olur?", a: "Evet, her sayfa ayrı bir JPG dosyası olarak kaydedilir." },
      { q: "PNG olarak da çıkarabilir miyim?", a: "Şu an JPG desteklenmektedir. PNG desteği Pro planda geliyor." },
      { q: "Çözünürlük kaç DPI?", a: "Varsayılan 150 DPI, yüksek kalite seçeneğinde 300 DPI." },
      { q: "Şifreli PDF dönüştürülebilir mi?", a: "Önce 'PDF Kilit Aç' aracıyla şifreyi kaldırmanız gerekir." }
    ],
    related: ["jpg-to-pdf","sikistir","birlestir","ayikla"]
  }
};

// Araç eşleştirme
const TOOL_MAP = {
  "sikistir": "sikistir",
  "birlestir": "birlestir",
  "bol": "bol",
  "ayikla": "ayikla",
  "rotate": "rotate",
  "dondur": "rotate",
  "sirala": "sirala",
  "kilitle": "kilitle",
  "kilit-ac": "kilit-ac",
  "unlock": "kilit-ac",
  "word": "pdf-to-word",
  "pdf-to-word": "pdf-to-word",
  "word-to-pdf": "word-to-pdf",
  "excel-to-pdf": "excel-to-pdf",
  "ppt-to-pdf": "ppt-to-pdf",
  "ocr": "ocr",
  "filigran": "filigran",
  "watermark": "filigran",
  "qr": "qr",
  "jpg-to-pdf": "jpg-to-pdf",
  "pdf-to-jpg": "pdf-to-jpg"
};

const RELATED_TOOLS = {
  "sikistir":   { href: "/pdf-sikistir",   icon: "fa-compress-alt",    label: "PDF Sıkıştır" },
  "birlestir":  { href: "/pdf-birlestir",  icon: "fa-object-group",    label: "PDF Birleştir" },
  "bol":        { href: "/pdf-bol",         icon: "fa-cut",             label: "PDF Böl" },
  "ayikla":     { href: "/pdf-sayfa-ayikla",icon: "fa-file-export",    label: "Sayfa Ayıkla" },
  "rotate":     { href: "/pdf-dondur",      icon: "fa-redo",            label: "PDF Döndür" },
  "sirala":     { href: "/sayfa-sirala",    icon: "fa-sort",            label: "Sayfa Sırala" },
  "kilitle":    { href: "/pdf-kilitle",     icon: "fa-lock",            label: "PDF Kilitle" },
  "kilit-ac":   { href: "/pdf-kilit-ac",   icon: "fa-lock-open",       label: "Kilit Aç" },
  "pdf-to-word":{ href: "/pdf-to-word",    icon: "fa-file-word",       label: "PDF → Word" },
  "word-to-pdf":{ href: "/word-to-pdf",    icon: "fa-file-pdf",        label: "Word → PDF" },
  "excel-to-pdf":{ href: "/excel-to-pdf", icon: "fa-file-excel",      label: "Excel → PDF" },
  "ppt-to-pdf": { href: "/ppt-to-pdf",     icon: "fa-file-powerpoint", label: "PPT → PDF" },
  "ocr":        { href: "/ocr",            icon: "fa-eye",             label: "OCR / Metin" },
  "filigran":   { href: "/filigran-ekle",  icon: "fa-stamp",           label: "Filigran Ekle" },
  "qr":         { href: "/qr-kod-ekle",    icon: "fa-qrcode",          label: "QR Kod Ekle" },
  "jpg-to-pdf": { href: "/jpg-to-pdf",     icon: "fa-image",           label: "JPG → PDF" },
  "pdf-to-jpg": { href: "/pdf-to-jpg",     icon: "fa-file-image",      label: "PDF → JPG" },
  "koruma":     { href: "/pdf-kilitle",    icon: "fa-lock",            label: "PDF Kilitle" }
};

function injectToolContent() {
  const toolRaw = document.body.getAttribute("data-tool") || "";
  const toolKey = TOOL_MAP[toolRaw] || null;
  const data = toolKey ? TOOL_DATA[toolKey] : null;
  if (!data) return;

  const main = document.querySelector("main .container") || document.querySelector("main");
  if (!main) return;

  // Inject CSS
  if (!document.getElementById("__tool_content_css")) {
    const s = document.createElement("style");
    s.id = "__tool_content_css";
    s.textContent = `
      .tc-section { margin-top: 4rem; }
      .tc-section-title {
        font-size: 1.35rem; font-weight: 800; color: var(--text, #1a1a2e);
        margin-bottom: .4rem; text-align: center;
      }
      .tc-section-sub {
        text-align: center; color: var(--muted, #6c757d);
        font-size: .9rem; margin-bottom: 2rem;
      }

      /* ── Adımlar ── */
      .tc-steps {
        display: grid; grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem; margin-bottom: 1rem;
      }
      @media(max-width: 640px) { .tc-steps { grid-template-columns: 1fr; } }
      .tc-step {
        background: var(--bg2, #f8f9fa); border: 1px solid var(--border, #e9ecef);
        border-radius: 16px; padding: 1.5rem 1.25rem; text-align: center;
        position: relative; transition: box-shadow .2s, transform .2s;
      }
      .tc-step:hover { box-shadow: 0 8px 24px rgba(0,0,0,.08); transform: translateY(-2px); }
      .tc-step-num {
        position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
        width: 26px; height: 26px; border-radius: 50%;
        background: #1a1a2e; color: #fff;
        font-size: .75rem; font-weight: 800;
        display: flex; align-items: center; justify-content: center;
      }
      .tc-step-icon {
        width: 52px; height: 52px; border-radius: 14px;
        background: #1a1a2e; color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.2rem; margin: .5rem auto 1rem;
      }
      .tc-step h3 { font-size: .95rem; font-weight: 700; color: var(--text, #1a1a2e); margin-bottom: .35rem; }
      .tc-step p { font-size: .82rem; color: var(--muted, #6c757d); line-height: 1.5; }

      /* ── Özellikler ── */
      .tc-features {
        display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;
      }
      @media(max-width: 480px) { .tc-features { grid-template-columns: 1fr; } }
      .tc-feat {
        display: flex; gap: .9rem; align-items: flex-start;
        background: var(--bg2, #f8f9fa); border: 1px solid var(--border, #e9ecef);
        border-radius: 14px; padding: 1.1rem 1.2rem;
      }
      .tc-feat-icon {
        width: 40px; height: 40px; border-radius: 11px;
        background: #f0f1ff; color: #4f46e5;
        display: flex; align-items: center; justify-content: center;
        font-size: .95rem; flex-shrink: 0;
      }
      .tc-feat-body h4 { font-size: .9rem; font-weight: 700; color: var(--text, #1a1a2e); margin-bottom: .2rem; }
      .tc-feat-body p { font-size: .8rem; color: var(--muted, #6c757d); line-height: 1.5; }

      /* ── SSS ── */
      .tc-faq { display: flex; flex-direction: column; gap: .6rem; }
      .tc-faq-item {
        border: 1px solid var(--border, #e9ecef); border-radius: 12px;
        overflow: hidden; background: var(--bg, #fff);
      }
      .tc-faq-q {
        width: 100%; text-align: left; background: none; border: none;
        padding: 1rem 1.25rem; font-size: .92rem; font-weight: 700;
        color: var(--text, #1a1a2e); cursor: pointer; font-family: inherit;
        display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      }
      .tc-faq-q:hover { background: var(--bg2, #f8f9fa); }
      .tc-faq-q i { color: var(--muted, #6c757d); transition: transform .25s; flex-shrink: 0; }
      .tc-faq-item.open .tc-faq-q i { transform: rotate(180deg); }
      .tc-faq-a {
        display: none; padding: 0 1.25rem 1rem;
        font-size: .875rem; color: var(--muted, #6c757d); line-height: 1.65;
      }
      .tc-faq-item.open .tc-faq-a { display: block; }

      /* ── İlgili Araçlar ── */
      .tc-related {
        display: flex; flex-wrap: wrap; gap: .75rem; justify-content: center;
      }
      .tc-related-card {
        display: flex; align-items: center; gap: .55rem;
        background: var(--bg2, #f8f9fa); border: 1px solid var(--border, #e9ecef);
        border-radius: 12px; padding: .65rem 1rem;
        text-decoration: none; color: var(--text, #1a1a2e);
        font-size: .875rem; font-weight: 600; transition: .18s;
      }
      .tc-related-card:hover {
        border-color: #6366f1; color: #4f46e5;
        box-shadow: 0 4px 16px rgba(99,102,241,.12); transform: translateY(-1px);
      }
      .tc-related-card i { color: #6366f1; font-size: .95rem; }
    `;
    document.head.appendChild(s);
  }

  const html = `
    <!-- ── Nasıl Kullanılır ── -->
    <div class="tc-how">
      <p class="tc-how-label">Nasıl Kullanılır</p>
      <div class="tc-how-steps">
        ${data.steps.map((s, i) => `
          <div class="tc-how-step">
            <span class="tc-how-num">${i + 1}</span>
            <div class="tc-how-body">
              <strong>${s.title}</strong>
              <p>${s.desc}</p>
            </div>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- ── İlgili Araçlar ── -->
    <div class="tc-related-section">
      <p class="tc-related-label">İlgili Araçlar</p>
      <div class="tc-related-row">
        ${(data.related || []).map(key => {
          const t = RELATED_TOOLS[key];
          if (!t) return "";
          return `<a href="${t.href}" class="tc-rel-chip"><i class="fas ${t.icon}"></i>${t.label}</a>`;
        }).join("")}
      </div>
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  main.appendChild(wrap);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectToolContent, { once: true });
} else {
  injectToolContent();
}
