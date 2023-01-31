<!DOCTYPE html>
<html>
<head>
<title>calculator</title>
</head>
<body>

<h1>Addras Ballance Calculator</h1>
<hr><br>
<from method="GET" action="">
    <pre>
        Number 1 : <input type="text" name="one">
        Number 2 : <input type="text" name="two">
        Operations :
        <input type="radio" name="operation" value="1">addition
        <input type="radio" name="operation" value="2">subtraction
        <input type="radio" name="operation" value="3">multiplication
        <input type="radio" name="operation" value="4">division
        
        <input type="submit" name="press" value="total">
        <input type="reset" name="delete" value="deleted">
        
    </pre>
</from>
<hr><br>
result :

</body>
</html>


<?php
if (isset($_GE['press']==1)){
    $n1 = $_GET['one'];
    $n1 = $_GET['two'];
    
    if ($_GET['operation']==1){
        echo "Result of addition is = ".($nl+$n2);
    }
    
    elseif ($_GET['operation']==2){
        echo "Result of subtraction is = ".($nl-$n2);
    }
    
    if ($_GET['operation']==3){
        echo "Result of multiplication is = ".($nl*$n2);
    }
    
    if ($_GET['operation']==4){
        echo "Result of division is = ".($nl/$n2);
    }

}
?>