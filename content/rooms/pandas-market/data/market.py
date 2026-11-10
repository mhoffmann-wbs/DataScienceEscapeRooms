# Kleeberg farmers' market, Saturday. Writes the market's three CSV files, so your
# code can read them with pd.read_csv(...). Loaded before your code runs.

with open("stalls.csv", "w", encoding="utf-8") as _f:
    _f.write("""\
stall_id,stall,owner,product,pitch
S01,Hof Linde,Jonas Linde,vegetables,1
S02,Bäckerei Krume,Ayşe Kaya,bread,2
S03,Käserei Alpweide,Marco Bianchi,cheese,3
S04,Imkerei Sommer,Lena Sommer,honey,4
S05,Obstgarten Petersen,Hanne Petersen,fruit,5
S06,Blumen Wild,Emil Wild,flowers,6
S07,Bienenhaus Okafor,Grace Okafor,honey,9
S08,Eierhof Brandt,Paul Brandt,eggs,7
S09,Kräuter & Co,Sofia Lindqvist,herbs,8
S10,Mosterei Apfelgrün,Tim Berger,juice,10
S11,Räucherei Hansen,Nils Hansen,fish,11
S12,Biohof Mertens,Rosa Mertens,vegetables,12
""")

with open("sales.csv", "w", encoding="utf-8") as _f:
    _f.write("""\
time,stall_id,item,qty,price,payment
08:03,S02,sourdough loaf,3,€4.50,card
08:03,S04,forest honey,4,"8,9",Card
08:05,S02,bread roll,1,€0.60,cash
08:05,s10,apple juice 1 l,3,€3.50,EC
08:06,S08,"eggs, 10",2,"3,9",card 
08:07,S05,plums 500 g,1,"3,20 €",cash
08:08,S01,tomatoes 500 g,1,"3,40 €",cash 
08:10,S03,mountain cheese 200 g,1,5.90,cash
08:11,S12,potatoes 1 kg,2,"2,5",Cash
08:14, S01,carrots,4,"1,80 €",cash
08:18, S05,plums 500 g,3,"3,20 €",CASH
08:21,S07,beeswax candle,1,5.00,cash
08:22,S04,beeswax candle,1,5,card
08:23,S09,herb bundle,3,"1,50 €",card
08:25,S07,blossom honey,3,7.50,Card
08:29,S09,basil pot,4,"2,20 €",EC
08:30,S01,tomatoes 500 g,2,"3,40 €",EC
08:30,s06,bouquet,4,€12.00,EC
08:35,S03,mountain cheese 200 g,3,5.90,Cash
08:36,S02,bread roll,3,€0.60,card
08:40,S05,apples 1 kg,4,"2,80 €",card
08:40,S12,carrots,4,"1,8",cash 
08:43,S01,potatoes 1 kg,1,"2,50 €",Card
08:46,S07,blossom honey,2,7.50,cash
08:47,S02,bread roll,1,€0.60,cash
08:47,s02,pretzel,1,€1.10,EC
08:48,S04,forest honey,2,"8,9",cash 
08:49,S04,beeswax candle,4,5,Cash
08:51,S08 ,"eggs, 10",4,"3,9",Cash
08:52,S02,pretzel,1,€1.10,card 
08:55,S08,"eggs, 10",2,"3,9",cash
08:58,S03,mountain cheese 200 g,1,5.90,cash
08:58,S12,tomatoes 500 g,4,"3,4",cash 
09:03, S12,carrots,2,"1,8",cash
09:05,S11,smoked salmon,3,5.90,CASH
09:06,S01,potatoes 1 kg,2,"2,50 €",CASH
09:06,S05,plums 500 g,2,"3,20 €",CASH
09:07, S06,bouquet,2,€12.00,Card
09:09,S12,tomatoes 500 g,1,"3,4",Cash
09:15,S01,tomatoes 500 g,1,"3,40 €",cash 
09:18,S12,tomatoes 500 g,3,"3,4",EC
09:19,S04,forest honey,2,"8,9",cash 
09:21,S01,potatoes 1 kg,2,"2,50 €",card
09:22,S10,apple juice 1 l,2,€3.50,cash
09:22,s11,smoked salmon,1,5.90,card 
09:26,s04,beeswax candle,1,5,Cash
09:26,S06,sunflowers,2,€2.50,Card
09:27,s01,potatoes 1 kg,1,"2,50 €",cash
09:28,S06,bouquet,2,€12.00,card
09:29,S04,blossom honey,1,"7,5",cash
09:29,S08,"eggs, 10",1,"3,9",card
09:29,S08,"eggs, 6",3,"2,4",EC
09:33,S01,carrots,1,"1,80 €",CASH
09:34,S12,carrots,1,"1,8",card 
09:36,S02,sourdough loaf,2,€4.50,EC
09:40,S08,"eggs, 10",1,"3,9",Cash
09:41,S03,mountain cheese 200 g,3,5.90,Cash
09:41,S10,apple juice 1 l,2,€3.50,Card
09:43,s07,beeswax candle,1,5.00,CASH
09:46,S03,mountain cheese 200 g,2,5.90,cash
09:50,S01,potatoes 1 kg,2,"2,50 €",card
09:51,S03,goat cheese,4,4.20,card
09:51,S04,beeswax candle,1,5,EC
09:54,S05,plums 500 g,1,"3,20 €",cash
09:54,S05,apples 1 kg,1,"2,80 €",cash
09:54,S07,blossom honey,2,7.50,EC
09:54,s09,basil pot,1,"2,20 €",cash 
09:55,S02,bread roll,3,€0.60,card
09:57,S01,tomatoes 500 g,2,"3,40 €",Card
10:00,S09,herb bundle,1,"1,50 €",cash
10:03,S02,bread roll,3,€0.60,cash
10:04,S04,blossom honey,2,"7,5",card
10:04,S12,lettuce,2,"1,2",cash
10:07,S11,smoked salmon,1,5.90,cash 
10:09,S11 ,smoked trout,1,6.50,card
10:10,S03,goat cheese,3,4.20,cash
10:11, S10,cider,4,€4.80,card
10:12,S12,carrots,1,"1,8",cash
10:15,s07,blossom honey,2,7.50,EC
10:16,S12,lettuce,1,"1,2",cash
10:17,S06,sunflowers,1,€2.50,CASH
10:18, S12,tomatoes 500 g,1,"3,4",Cash
10:20,s12,lettuce,1,"1,2",cash
10:23,S09,herb bundle,1,"1,50 €",card
10:26,s01,potatoes 1 kg,3,"2,50 €",cash
10:26,s05,plums 500 g,1,"3,20 €",CASH
10:26,S08,"eggs, 10",3,"3,9",Cash
10:28,S08,"eggs, 6",2,"2,4",Cash
10:28,S10,cider,4,€4.80,card 
10:28,S11,smoked trout,3,6.50,cash
10:29,S02,sourdough loaf,1,€4.50,card
10:30,S02,pretzel,1,€1.10,card 
10:30,S09 ,basil pot,3,"2,20 €",cash
10:37,S02,bread roll,4,€0.60,cash
10:37,S06,sunflowers,4,€2.50,EC
10:39,S07,forest honey,1,8.90,Card
10:43, S06,sunflowers,1,€2.50,card 
10:49,S10,apple juice 1 l,4,€3.50,card 
10:50,S06,sunflowers,2,€2.50,cash
10:50,S08,"eggs, 6",4,"2,4",cash
10:53,s05,plums 500 g,1,"3,20 €",cash
10:54,S06,bouquet,1,€12.00,cash
10:56,s06,sunflowers,1,€2.50,cash
10:57,S02,pretzel,1,€1.10,cash
11:05,S09,basil pot,3,"2,20 €",card
11:06,S01,tomatoes 500 g,2,"3,40 €",Card
11:06,S12,carrots,2,"1,8",cash
11:14,S04,blossom honey,2,"7,5",card
11:16,S11,smoked salmon,2,5.90,card
11:18,S02,pretzel,4,€1.10,CASH
11:18, S03,mountain cheese 200 g,4,5.90,cash
11:23,S04,blossom honey,2,"7,5",cash
11:23,S08,"eggs, 10",1,"3,9",cash
11:28,S04,blossom honey,2,"7,5",Cash
11:29,S08,"eggs, 6",2,"2,4",card 
11:32,S05,pears 1 kg,2,"3,00 €",card 
11:35,s01,tomatoes 500 g,4,"3,40 €",cash
11:35,S04,blossom honey,1,"7,5",card
11:39,S03,mountain cheese 200 g,4,5.90,Cash
11:45,S03,mountain cheese 200 g,1,5.90,EC
11:47,S02,sourdough loaf,4,€4.50,Cash
11:47,S10,cider,3,€4.80,Card
11:49,S12,carrots,2,"1,8",cash
11:50,S01,potatoes 1 kg,4,"2,50 €",cash
11:50,S04,blossom honey,4,"7,5",card
11:50,S06,bouquet,1,€12.00,cash
11:50,S11,smoked trout,4,6.50,CASH
11:54,S09,basil pot,1,"2,20 €",EC
11:55,S04,blossom honey,2,"7,5",card
11:55,S08,"eggs, 6",1,"2,4",cash
11:57,S12,carrots,2,"1,8",cash 
11:59, S02,pretzel,2,€1.10,card 
12:01,S09,herb bundle,4,"1,50 €",card 
12:01,S12,carrots,1,"1,8",card
12:04,S03,mountain cheese 200 g,3,5.90,EC
12:07,S11,smoked salmon,2,5.90,CASH
12:11,S04,beeswax candle,2,5,Cash
12:12,S08,"eggs, 6",2,"2,4",cash
12:12,S11,smoked salmon,4,5.90,EC
12:13,S09,basil pot,2,"2,20 €",EC
12:16,S03,goat cheese,1,4.20,Card
12:16,S07 ,beeswax candle,1,5.00,cash
12:17,S06,bouquet,3,€12.00,cash
12:18, S01,lettuce,2,"1,20 €",Card
12:18,S06,bouquet,2,€12.00,EC
12:18,S10,apple juice 1 l,1,€3.50,EC
12:20,S10,cider,1,€4.80,Cash
12:22,S12,tomatoes 500 g,4,"3,4",Cash
12:24,S02,bread roll,4,€0.60,cash
12:26,S01,lettuce,1,"1,20 €",card 
12:28,S08,"eggs, 10",4,"3,9",cash
12:30,S11,smoked salmon,3,5.90,Cash
12:33,S05,apples 1 kg,1,"2,80 €",Cash
12:33,s06,bouquet,1,€12.00,Cash
12:38,S02,sourdough loaf,1,€4.50,card
12:42,S02,sourdough loaf,1,€4.50,cash 
12:42,S05 ,pears 1 kg,2,"3,00 €",CASH
12:42,S06,sunflowers,4,€2.50,cash
12:43,S05,pears 1 kg,1,"3,00 €",card
12:46,S08,"eggs, 6",1,"2,4",CASH
12:50,S09,basil pot,3,"2,20 €",CASH
12:51,s01,tomatoes 500 g,1,"3,40 €",cash
12:52,S06,sunflowers,3,€2.50,cash
12:52,s07,forest honey,1,8.90,Card
12:56,S07,blossom honey,4,7.50,cash 
12:57,s01,potatoes 1 kg,1,"2,50 €",cash
12:58,S01,potatoes 1 kg,2,"2,50 €",cash
12:59,S05,apples 1 kg,1,"2,80 €",card
12:59,S05,pears 1 kg,1,"3,00 €",EC
13:00,S06,sunflowers,1,€2.50,cash
13:03,S09 ,basil pot,1,"2,20 €",cash
13:03,S11,smoked salmon,4,5.90,cash
13:04,S07,blossom honey,1,7.50,cash 
13:04,S09,herb bundle,1,"1,50 €",EC
13:05,S03,goat cheese,1,4.20,card
13:05,s11,smoked salmon,1,5.90,card 
13:08,S08,"eggs, 6",1,"2,4",EC
13:08,s11,smoked trout,2,6.50,cash
13:12,S06,bouquet,2,€12.00,cash
13:13,S08,"eggs, 10",3,"3,9",cash
13:13,S12,potatoes 1 kg,2,"2,5",cash
13:14, S09,herb bundle,1,"1,50 €",EC
13:17,S03,mountain cheese 200 g,1,5.90,cash 
13:17,S09,herb bundle,3,"1,50 €",Cash
13:19,S01,lettuce,1,"1,20 €",CASH
13:19,S06,bouquet,2,€12.00,cash
13:20,S07 ,forest honey,2,8.90,CASH
13:20,S10,cider,1,€4.80,cash 
13:21,S02,pretzel,1,€1.10,Card
13:24,S07,forest honey,1,8.90,card
13:24,s10,apple juice 1 l,1,€3.50,CASH
13:26,S01,carrots,3,"1,80 €",card
13:28,S07,beeswax candle,2,5.00,cash
13:29,S10,cider,1,€4.80,card 
13:30,S01,potatoes 1 kg,3,"2,50 €",Cash
13:30,S10,cider,1,€4.80,card
13:32,S06,sunflowers,2,€2.50,Card
13:33,S12,tomatoes 500 g,4,"3,4",cash
13:35,S10,cider,1,€4.80,cash
13:36,S04,blossom honey,1,"7,5",Cash
13:36,S06,sunflowers,3,€2.50,card
13:37,S04,blossom honey,1,"7,5",EC
13:37,S11 ,smoked salmon,1,5.90,cash 
13:37,S12 ,lettuce,1,"1,2",EC
13:42,S02,bread roll,1,€0.60,Cash
13:42,S04,forest honey,4,"8,9",cash 
13:43,S03,mountain cheese 200 g,1,5.90,Cash
13:43,S07,beeswax candle,3,5.00,cash
13:43,S12,potatoes 1 kg,4,"2,5",card
13:45,S05,pears 1 kg,2,"3,00 €",CASH
13:46,S01,potatoes 1 kg,4,"2,50 €",Card
13:49,S12,tomatoes 500 g,4,"3,4",cash
13:50,S09,basil pot,3,"2,20 €",cash
13:52,s04,beeswax candle,2,5,cash
13:52,S12,lettuce,2,"1,2",EC
13:53, S03,goat cheese,1,4.20,Card
13:55,s02,sourdough loaf,1,€4.50,CASH
13:58,s12,tomatoes 500 g,2,"3,4",cash
""")

with open("handover.csv", "w", encoding="utf-8") as _f:
    _f.write("""\
stall,envelope_eur,badge
Räucherei Hansen,141.1,12
Bäckerei Krume,41.4,3
Biohof Mertens,105.7,12
Kräuter & Co,30.2,9
Mosterei Apfelgrün,24.9,5
Imkerei Sommer,81.2,9
Blumen Wild,150.0,7
Hof Linde,74.0,9
Eierhof Brandt,94.2,7
Obstgarten Petersen,46.4,9
Bienenhaus Okafor,30.3,7
Käserei Alpweide,130.6,7
""")

import pandas as pd
